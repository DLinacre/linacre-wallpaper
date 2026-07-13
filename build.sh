#!/bin/bash
# Linacre Wallpaper Build Script
# Creates distribution package for Lively Wallpaper

set -e

VERSION="${1:-1.0.0}"
OUTPUT_DIR="${2:-dist}"

echo "Building Linacre Wallpaper v$VERSION..."

# Clean output
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy frontend
echo "Copying frontend..."
cp -r frontend "$OUTPUT_DIR/"

# Copy backend
echo "Copying backend..."
cp -r backend "$OUTPUT_DIR/"
# Clean up
rm -rf "$OUTPUT_DIR/backend/__pycache__"
rm -rf "$OUTPUT_DIR/backend/.venv"
rm -f "$OUTPUT_DIR/backend/.env"

# Copy README
cp README.md "$OUTPUT_DIR/"

# Create Lively Wallpaper package
echo "Creating Lively Wallpaper package..."
cd "$OUTPUT_DIR/frontend"
zip -r "../linacre-wallpaper-v$VERSION.lively.zip" . -x "*.git*" "node_modules/*" "*.DS_Store" "*.map"
cd ../..

# Create installer script
echo "Creating installer script..."
cat > "$OUTPUT_DIR/install.sh" << INSTALL_EOF
#!/bin/bash
# Linacre Wallpaper Installer for Linux/macOS/WSL

VERSION="$VERSION"
INSTALL_DIR="\$HOME/.local/share/linacre-wallpaper"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Linacre System Monitor Wallpaper v\$VERSION           ║"
echo "║                    Installer for Linux/macOS                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo
echo "Installing to: \$INSTALL_DIR"
echo

mkdir -p "\$INSTALL_DIR"

echo "Copying backend..."
cp -r backend "\$INSTALL_DIR/"

echo "Setting up Python virtual environment..."
cd "\$INSTALL_DIR/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo
echo "Creating systemd user service..."
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/linacre-wallpaper-backend.service << SERVICE_EOF
[Unit]
Description=Linacre Wallpaper Backend
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=\$INSTALL_DIR/backend
ExecStart=\$INSTALL_DIR/backend/.venv/bin/python -m main
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
SERVICE_EOF

systemctl --user daemon-reload
systemctl --user enable linacre-wallpaper-backend.service

echo
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Backend installed! Next steps:                              ║"
echo "║                                                              ║"
echo "║  1. Start backend:                                           ║"
echo "║     systemctl --user start linacre-wallpaper-backend         ║
echo "║     # Or manually:                                           ║
echo "║     cd \$INSTALL_DIR/backend                                  ║
echo "║     source .venv/bin/activate                                ║
echo "║     python -m main                                           ║
echo "║                                                              ║"
echo "║  2. Install wallpaper in Lively Wallpaper (Windows only):    ║
echo "║     This package is for backend on Linux/WSL.                ║
echo "║     On Windows host, use the .lively.zip package.            ║
echo "║                                                              ║
echo "║  3. Configure WS Host: 127.0.0.1, Port: 8765                 ║
echo "╚══════════════════════════════════════════════════════════════╝"
echo
INSTALL_EOF

chmod +x "$OUTPUT_DIR/install.sh"

echo
echo "Build complete!"
echo "Output: $OUTPUT_DIR"
echo "Lively package: $OUTPUT_DIR/linacre-wallpaper-v$VERSION.lively.zip"
echo "Installer (Linux/WSL): $OUTPUT_DIR/install.sh"
echo "Installer (Windows): $OUTPUT_DIR/install.bat"
