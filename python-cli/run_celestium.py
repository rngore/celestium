#!/usr/bin/env python3
"""Zero-setup launcher for CELESTIUM CLI from inside the extracted project directory."""

import sys
from celestium.cli import main

if __name__ == "__main__":
    sys.exit(main())
