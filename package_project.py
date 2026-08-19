"""
AWS Infrastructure AI Assistant - Automated ZIP Packaging Script
Scans the current workspace, ignores virtual environments and cache files,
and compiles a clean, production-ready 'aws-infra-ai-platform.zip'.
"""

import os
import zipfile

OUTPUT_ZIP = "aws-infra-ai-platform.zip"
EXCLUDE_DIRS = {"venv", ".venv", "__pycache__", ".git", ".idea", ".vscode"}
EXCLUDE_EXTS = {".pyc", ".pyo", ".zip"}

def make_zip():
    print(f"📦 Packaging project into '{OUTPUT_ZIP}'...\n")
    
    total_files = 0
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk("."):
            # Filter out ignored directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for file in files:
                if file == OUTPUT_ZIP or file == "package_project.py":
                    continue
                if any(file.endswith(ext) for ext in EXCLUDE_EXTS):
                    continue
                
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, ".")
                
                zipf.write(full_path, rel_path)
                print(f"  + Added: {rel_path}")
                total_files += 1

    print(f"\n✅ SUCCESS: Packaged {total_files} files into '{OUTPUT_ZIP}'")
    print(f"📍 Location: {os.path.abspath(OUTPUT_ZIP)}")

if __name__ == "__main__":
    make_zip()