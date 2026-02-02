#include <QApplication>
#include <QStyleFactory>
#include <QFontDatabase>
#include "mainwindow.h"
#include "database.h"

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    
    // Application info
    app.setApplicationName("Wishmaster");
    app.setApplicationVersion("1.0.0");
    app.setOrganizationName("Wishmaster");
    app.setOrganizationDomain("wishmaster.local");
    
    // Dark theme (Cyberpunk style)
    app.setStyle(QStyleFactory::create("Fusion"));
    
    QPalette darkPalette;
    darkPalette.setColor(QPalette::Window, QColor(18, 18, 24));
    darkPalette.setColor(QPalette::WindowText, QColor(0, 255, 255)); // Cyan
    darkPalette.setColor(QPalette::Base, QColor(25, 25, 35));
    darkPalette.setColor(QPalette::AlternateBase, QColor(35, 35, 45));
    darkPalette.setColor(QPalette::ToolTipBase, QColor(0, 255, 255));
    darkPalette.setColor(QPalette::ToolTipText, QColor(18, 18, 24));
    darkPalette.setColor(QPalette::Text, QColor(220, 220, 220));
    darkPalette.setColor(QPalette::Button, QColor(35, 35, 50));
    darkPalette.setColor(QPalette::ButtonText, QColor(0, 255, 255));
    darkPalette.setColor(QPalette::BrightText, QColor(255, 0, 128)); // Magenta
    darkPalette.setColor(QPalette::Link, QColor(0, 255, 255));
    darkPalette.setColor(QPalette::Highlight, QColor(0, 255, 255));
    darkPalette.setColor(QPalette::HighlightedText, QColor(18, 18, 24));
    app.setPalette(darkPalette);
    
    // Custom stylesheet for cyberpunk glow effects
    app.setStyleSheet(R"(
        QMainWindow {
            background-color: #121218;
        }
        QTextEdit, QLineEdit {
            background-color: #191923;
            border: 1px solid #00ffff;
            border-radius: 8px;
            padding: 8px;
            color: #dcdcdc;
            selection-background-color: #00ffff;
            selection-color: #121218;
        }
        QTextEdit:focus, QLineEdit:focus {
            border: 2px solid #00ffff;
        }
        QPushButton {
            background-color: rgba(0, 255, 255, 0.1);
            border: 1px solid #00ffff;
            border-radius: 8px;
            padding: 10px 20px;
            color: #00ffff;
            font-weight: bold;
        }
        QPushButton:hover {
            background-color: rgba(0, 255, 255, 0.2);
        }
        QPushButton:pressed {
            background-color: rgba(0, 255, 255, 0.3);
        }
        QScrollBar:vertical {
            background: #191923;
            width: 10px;
            border-radius: 5px;
        }
        QScrollBar::handle:vertical {
            background: #00ffff;
            border-radius: 5px;
            min-height: 20px;
        }
        QSlider::groove:horizontal {
            background: #191923;
            height: 8px;
            border-radius: 4px;
        }
        QSlider::handle:horizontal {
            background: #00ffff;
            width: 18px;
            margin: -5px 0;
            border-radius: 9px;
        }
        QComboBox {
            background-color: #191923;
            border: 1px solid #00ffff;
            border-radius: 8px;
            padding: 8px;
            color: #00ffff;
        }
        QComboBox::drop-down {
            border: none;
        }
        QListWidget {
            background-color: #191923;
            border: 1px solid #00ffff;
            border-radius: 8px;
        }
        QListWidget::item {
            padding: 10px;
            border-bottom: 1px solid rgba(0, 255, 255, 0.2);
        }
        QListWidget::item:selected {
            background-color: rgba(0, 255, 255, 0.2);
        }
        QTabWidget::pane {
            border: 1px solid #00ffff;
            border-radius: 8px;
        }
        QTabBar::tab {
            background: #191923;
            border: 1px solid #00ffff;
            padding: 10px 20px;
            color: #00ffff;
        }
        QTabBar::tab:selected {
            background: rgba(0, 255, 255, 0.2);
        }
    )");
    
    // Initialize database
    Database::instance().initialize();
    
    // Create and show main window
    MainWindow window;
    window.show();
    
    return app.exec();
}
