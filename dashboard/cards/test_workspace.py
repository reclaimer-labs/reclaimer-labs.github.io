"""Compatibility entry point: the active module is the content workspace."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name("test_content_workspace.py")), run_name="__main__")
