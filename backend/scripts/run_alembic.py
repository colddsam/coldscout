import subprocess
import os

# Ensure we use the correct relative path to the venv
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
alembic_path = os.path.join(root_dir, 'venv', 'Scripts', 'alembic')

res = subprocess.run([alembic_path, 'upgrade', 'head'], capture_output=True, text=True)
with open(os.path.join(root_dir, 'alembic_error.txt'), 'w') as f:
    f.write(res.stdout)
    f.write("\n---\n")
    f.write(res.stderr)
