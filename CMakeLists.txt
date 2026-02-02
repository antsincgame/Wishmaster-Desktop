cmake_minimum_required(VERSION 3.16)

project(WishmasterDesktop VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Qt6 components
find_package(Qt6 REQUIRED COMPONENTS 
    Core 
    Gui 
    Widgets 
    Multimedia
    Sql
    Network
    Concurrent
)

# Options
option(BUILD_WITH_LLAMA "Build with llama.cpp support" ON)
option(BUILD_WITH_WHISPER "Build with whisper.cpp for STT" ON)
option(BUILD_WITH_TTS "Build with TTS support (ONNX)" ON)

# Sources
set(SOURCES
    src/main.cpp
    src/mainwindow.cpp
    src/chatwidget.cpp
    src/settingsdialog.cpp
    src/modelmanager.cpp
    src/database.cpp
    src/llm/llamaengine.cpp
    src/voice/ttsengine.cpp
    src/voice/sttengine.cpp
    src/persona/personaanalyzer.cpp
)

set(HEADERS
    src/mainwindow.h
    src/chatwidget.h
    src/settingsdialog.h
    src/modelmanager.h
    src/database.h
    src/llm/llamaengine.h
    src/voice/ttsengine.h
    src/voice/sttengine.h
    src/persona/personaanalyzer.h
)

set(RESOURCES
    resources/resources.qrc
)

# llama.cpp integration
if(BUILD_WITH_LLAMA)
    add_subdirectory(external/llama.cpp)
    list(APPEND EXTRA_LIBS llama ggml)
    add_definitions(-DWITH_LLAMA)
endif()

# whisper.cpp integration
if(BUILD_WITH_WHISPER)
    add_subdirectory(external/whisper.cpp)
    list(APPEND EXTRA_LIBS whisper)
    add_definitions(-DWITH_WHISPER)
endif()

# ONNX Runtime for TTS
if(BUILD_WITH_TTS)
    find_package(onnxruntime QUIET)
    if(onnxruntime_FOUND)
        list(APPEND EXTRA_LIBS onnxruntime)
        add_definitions(-DWITH_TTS)
    else()
        message(STATUS "ONNX Runtime not found, TTS disabled")
    endif()
endif()

# Executable
add_executable(${PROJECT_NAME}
    ${SOURCES}
    ${HEADERS}
    ${RESOURCES}
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/external/llama.cpp/include
    ${CMAKE_CURRENT_SOURCE_DIR}/external/whisper.cpp
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Multimedia
    Qt6::Sql
    Qt6::Network
    Qt6::Concurrent
    ${EXTRA_LIBS}
)

# Install
install(TARGETS ${PROJECT_NAME}
    BUNDLE DESTINATION .
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

# Platform-specific
if(WIN32)
    set_target_properties(${PROJECT_NAME} PROPERTIES WIN32_EXECUTABLE TRUE)
endif()

if(APPLE)
    set_target_properties(${PROJECT_NAME} PROPERTIES
        MACOSX_BUNDLE TRUE
        MACOSX_BUNDLE_GUI_IDENTIFIER com.wishmaster.desktop
        MACOSX_BUNDLE_BUNDLE_VERSION ${PROJECT_VERSION}
        MACOSX_BUNDLE_SHORT_VERSION_STRING ${PROJECT_VERSION_MAJOR}.${PROJECT_VERSION_MINOR}
    )
endif()
