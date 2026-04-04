import os
import re
import sys

# Common patterns for secrets
PATTERNS = [
    r'(?:key|password|secret|token|credential|api_key|auth_token)\s*=\s*[\'"][a-zA-Z0-9_\-\.]{10,}[\'"]',
    r'AIza[0-9A-Za-z\\-_]{35}',  # Google API Key
    r'gsk_[a-zA-Z0-9]{48}',       # Groq API Key
    r'xkeysib-[a-f0-9]{64}',     # Brevo/Sendinblue
    r'sk-ant-api03-[a-zA-Z0-9\-_]{93}', # Anthropic
    r'xox[bap]-[0-9]{12}-[0-9]{12}-[a-zA-Z0-9]{24}', # Slack
]

# Files/Directories to skip
SKIP_DIRS = {'.git', 'node_modules', 'venv', '.venv', '__pycache__', '.pytest_cache', 'dist', 'build'}
SKIP_FILES = {'.env', '.env.local', '.env.production', 'package-lock.json', 'yarn.lock'}

def scan_file(file_path):
    findings = []
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            for i, line in enumerate(f, 1):
                for pattern in PATTERNS:
                    if re.search(pattern, line, re.IGNORECASE):
                        # Filter out common false positives or seeds we know about
                        if "admin_password_123" in line: continue
                        findings.append((i, line.strip()))
    except Exception as e:
        pass
    return findings

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(f"--- Scanning for secrets in: {root_dir} ---")
    total_findings = 0
    
    for root, dirs, files in os.walk(root_dir):
        # Prune skipped directories
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        
        for file in files:
            if file in SKIP_FILES:
                continue
            
            file_path = os.path.join(root, file)
            findings = scan_file(file_path)
            if findings:
                rel_path = os.path.relpath(file_path, root_dir)
                print(f"\n[!] Potential Secret Found in {rel_path}:")
                for line_no, content in findings:
                    print(f"    L{line_no}: {content}")
                total_findings += len(findings)

    print(f"\n--- Scan Complete. Total potential leaks: {total_findings} ---")
    if total_findings > 0:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
