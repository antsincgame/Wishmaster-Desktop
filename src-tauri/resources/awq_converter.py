#!/usr/bin/env python3
"""
AWQ to GGUF Converter for Wishmaster Desktop

This script converts AWQ quantized models to GGUF format compatible with llama.cpp.
Requires: transformers, torch, auto-awq, huggingface_hub

Usage:
    python awq_converter.py --check          # Check dependencies
    python awq_converter.py --install        # Install dependencies  
    python awq_converter.py --convert <repo_id> --output <path> [--quant Q4_K_M]
"""

import sys
import os
import json
import subprocess
import argparse
import tempfile
import shutil
from pathlib import Path

# Minimum Python version
MIN_PYTHON = (3, 9)

def log_progress(stage: str, percent: float, message: str, error: str = None):
    """Output progress as JSON for Tauri to parse"""
    data = {
        "stage": stage,
        "percent": percent,
        "message": message,
        "error": error
    }
    print(json.dumps(data), flush=True)

def check_python_version() -> bool:
    """Check if Python version is sufficient"""
    return sys.version_info >= MIN_PYTHON

def check_dependencies() -> dict:
    """Check if all required packages are installed"""
    required = {
        "torch": None,
        "transformers": None,
        "autoawq": None,
        "huggingface_hub": None,
        "safetensors": None,
    }
    
    for pkg in required:
        try:
            if pkg == "autoawq":
                import awq
                required[pkg] = getattr(awq, "__version__", "installed")
            elif pkg == "torch":
                import torch
                required[pkg] = torch.__version__
            elif pkg == "transformers":
                import transformers
                required[pkg] = transformers.__version__
            elif pkg == "huggingface_hub":
                import huggingface_hub
                required[pkg] = huggingface_hub.__version__
            elif pkg == "safetensors":
                import safetensors
                required[pkg] = getattr(safetensors, "__version__", "installed")
        except ImportError:
            required[pkg] = None
    
    return required

def install_dependencies():
    """Install required packages"""
    log_progress("install", 0, "Установка зависимостей...")
    
    packages = [
        "torch",
        "transformers>=4.35.0",
        "autoawq>=0.1.8",
        "huggingface_hub",
        "safetensors",
        "accelerate",
    ]
    
    for i, pkg in enumerate(packages):
        log_progress("install", (i / len(packages)) * 100, f"Установка {pkg}...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pkg, "-q"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
        except subprocess.CalledProcessError as e:
            log_progress("install", 0, f"Ошибка установки {pkg}", str(e))
            return False
    
    log_progress("install", 100, "Все зависимости установлены")
    return True

def convert_awq_to_gguf(
    repo_id: str,
    output_path: str,
    quant_type: str = "Q4_K_M",
    use_gpu: bool = True
):
    """
    Convert AWQ model to GGUF format
    
    Steps:
    1. Download AWQ model from HuggingFace
    2. Load and dequantize AWQ weights
    3. Save as FP16 safetensors
    4. Convert to GGUF using llama.cpp converter
    5. Optionally quantize to specified format
    """
    try:
        log_progress("download", 0, f"Загрузка модели {repo_id}...")
        
        from huggingface_hub import snapshot_download
        from transformers import AutoConfig
        
        # Create temp directory for intermediate files
        work_dir = tempfile.mkdtemp(prefix="awq_convert_")
        fp16_dir = os.path.join(work_dir, "fp16_model")
        os.makedirs(fp16_dir, exist_ok=True)
        
        # Download model
        log_progress("download", 10, "Скачивание AWQ модели...")
        model_path = snapshot_download(
            repo_id,
            local_dir=os.path.join(work_dir, "awq_model"),
            local_dir_use_symlinks=False
        )
        
        log_progress("download", 30, "Модель скачана, загрузка весов...")
        
        # Load AWQ model and dequantize
        log_progress("convert", 30, "Загрузка AWQ модели...")
        
        import torch
        from awq import AutoAWQForCausalLM
        
        # Determine device
        device = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
        log_progress("convert", 35, f"Используем устройство: {device}")
        
        # Load model
        model = AutoAWQForCausalLM.from_quantized(
            model_path,
            fuse_layers=False,
            device_map=device if device == "cuda" else None
        )
        
        log_progress("convert", 50, "Деквантизация AWQ → FP16...")
        
        # Get the underlying model for dequantization
        hf_model = model.model
        
        # Copy config and tokenizer
        config = AutoConfig.from_pretrained(model_path)
        config.save_pretrained(fp16_dir)
        
        # Copy tokenizer files
        for fname in os.listdir(model_path):
            if "token" in fname.lower() or fname.endswith(".json"):
                src = os.path.join(model_path, fname)
                dst = os.path.join(fp16_dir, fname)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
        
        log_progress("convert", 60, "Сохранение FP16 весов...")
        
        # Save in FP16 format
        hf_model.to(torch.float16)
        hf_model.save_pretrained(
            fp16_dir,
            safe_serialization=True,
            max_shard_size="10GB"
        )
        
        # Clean up GPU memory
        del model
        del hf_model
        if device == "cuda":
            torch.cuda.empty_cache()
        
        log_progress("convert", 70, "FP16 модель создана, конвертация в GGUF...")
        
        # Convert to GGUF using llama.cpp converter
        # First, try to find or download the converter
        converter_script = find_or_download_gguf_converter()
        
        if converter_script is None:
            # Fallback: use transformers' GGUF export if available
            log_progress("convert", 75, "Использую встроенную конвертацию...")
            output_gguf = convert_with_transformers(fp16_dir, output_path, quant_type)
        else:
            log_progress("convert", 75, "Конвертация через llama.cpp...")
            output_gguf = convert_with_llamacpp(converter_script, fp16_dir, output_path, quant_type)
        
        # Cleanup
        log_progress("convert", 95, "Очистка временных файлов...")
        shutil.rmtree(work_dir, ignore_errors=True)
        
        log_progress("complete", 100, f"Готово! Модель сохранена: {output_gguf}")
        return output_gguf
        
    except Exception as e:
        log_progress("error", 0, "Ошибка конвертации", str(e))
        raise

def find_or_download_gguf_converter():
    """Find or download llama.cpp's convert_hf_to_gguf.py"""
    # Check common locations
    possible_paths = [
        os.path.expanduser("~/.local/share/llama.cpp/convert_hf_to_gguf.py"),
        "/usr/local/share/llama.cpp/convert_hf_to_gguf.py",
        os.path.join(os.path.dirname(__file__), "convert_hf_to_gguf.py"),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return path
    
    # Try to download from GitHub
    try:
        import urllib.request
        url = "https://raw.githubusercontent.com/ggerganov/llama.cpp/master/convert_hf_to_gguf.py"
        download_path = os.path.expanduser("~/.local/share/llama.cpp/convert_hf_to_gguf.py")
        os.makedirs(os.path.dirname(download_path), exist_ok=True)
        urllib.request.urlretrieve(url, download_path)
        return download_path
    except:
        return None

def convert_with_llamacpp(converter_script: str, model_dir: str, output_path: str, quant_type: str):
    """Convert using llama.cpp's converter script"""
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    
    # Run converter
    cmd = [
        sys.executable,
        converter_script,
        model_dir,
        "--outfile", output_path,
        "--outtype", "f16"  # Start with F16, then quantize
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Converter failed: {result.stderr}")
    
    return output_path

def convert_with_transformers(model_dir: str, output_path: str, quant_type: str):
    """Fallback: try using transformers GGUF export (if available)"""
    # This is a placeholder - transformers doesn't have native GGUF export yet
    # We'll need to use a different approach
    
    try:
        from transformers import AutoModelForCausalLM
        import struct
        
        # This is a simplified GGUF writer
        # For production, we'd use a proper library
        log_progress("convert", 80, "Экспорт в GGUF формат...")
        
        # Load the FP16 model
        model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            torch_dtype="float16",
            device_map="cpu"
        )
        
        # For now, save as safetensors and note that full GGUF conversion needs llama.cpp
        model.save_pretrained(output_path.replace(".gguf", "_fp16"), safe_serialization=True)
        
        raise Exception(
            "Прямая конвертация в GGUF недоступна. "
            "Используйте llama.cpp convert_hf_to_gguf.py для завершения конвертации. "
            f"FP16 модель сохранена в: {output_path.replace('.gguf', '_fp16')}"
        )
        
    except ImportError:
        raise Exception("transformers не установлен")

def main():
    parser = argparse.ArgumentParser(description="AWQ to GGUF Converter")
    parser.add_argument("--check", action="store_true", help="Check dependencies")
    parser.add_argument("--install", action="store_true", help="Install dependencies")
    parser.add_argument("--convert", type=str, help="HuggingFace repo ID to convert")
    parser.add_argument("--output", type=str, help="Output GGUF file path")
    parser.add_argument("--quant", type=str, default="Q4_K_M", help="Quantization type")
    parser.add_argument("--no-gpu", action="store_true", help="Don't use GPU")
    
    args = parser.parse_args()
    
    # Check Python version
    if not check_python_version():
        log_progress("error", 0, 
            f"Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+ required, "
            f"found {sys.version_info.major}.{sys.version_info.minor}"
        )
        sys.exit(1)
    
    if args.check:
        # Check dependencies
        deps = check_dependencies()
        result = {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "python_ok": check_python_version(),
            "dependencies": deps,
            "all_installed": all(v is not None for v in deps.values()),
            "cuda_available": False
        }
        
        try:
            import torch
            result["cuda_available"] = torch.cuda.is_available()
            if result["cuda_available"]:
                result["cuda_device"] = torch.cuda.get_device_name(0)
        except:
            pass
        
        print(json.dumps(result))
        
    elif args.install:
        success = install_dependencies()
        sys.exit(0 if success else 1)
        
    elif args.convert:
        if not args.output:
            log_progress("error", 0, "Укажите --output путь")
            sys.exit(1)
        
        # Check dependencies first
        deps = check_dependencies()
        if not all(v is not None for v in deps.values()):
            missing = [k for k, v in deps.items() if v is None]
            log_progress("error", 0, f"Не установлены: {', '.join(missing)}", 
                        "Запустите: python awq_converter.py --install")
            sys.exit(1)
        
        try:
            result = convert_awq_to_gguf(
                args.convert,
                args.output,
                args.quant,
                use_gpu=not args.no_gpu
            )
            print(json.dumps({"success": True, "output": result}))
        except Exception as e:
            log_progress("error", 0, "Ошибка конвертации", str(e))
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
