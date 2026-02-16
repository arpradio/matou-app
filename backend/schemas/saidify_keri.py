#!/usr/bin/env python3
"""
SAIDify schemas using KERI's actual algorithm.

This script uses keripy's Schemer class to compute correct SAIDs.
Run this on the infrastructure machine where keripy is installed.

Usage:
  python3 saidify_keri.py endorsement-schema.json
  python3 saidify_keri.py --all
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from keri.core import scheming
except ImportError:
    print("Error: keripy not installed. Run: pip install keri")
    print("Or run this script inside a KERIA Docker container:")
    print("  docker exec -it keria python3 /path/to/saidify_keri.py")
    sys.exit(1)


def compute_said(schema_dict: dict) -> str:
    """Compute the SAID for a schema using keripy."""
    # Remove $id for computation (will be replaced with placeholder internally)
    schema_copy = dict(schema_dict)
    schema_copy.pop('$id', None)

    # Create a Schemer, which computes the SAID
    schemer = scheming.Schemer(sed=schema_copy)
    return schemer.said


def saidify_file(filepath: Path) -> str:
    """SAIDify a schema file and return the SAID."""
    print(f"Processing: {filepath}")

    with open(filepath, 'r') as f:
        schema = json.load(f)

    old_id = schema.get('$id', '(none)')

    # Compute new SAID
    new_id = compute_said(schema)

    print(f"  Old $id: {old_id}")
    print(f"  New $id: {new_id}")

    if old_id == new_id:
        print("  (no change)")
    else:
        # Update the schema
        schema['$id'] = new_id
        with open(filepath, 'w') as f:
            json.dump(schema, f, indent=4)
            f.write('\n')
        print("  Updated!")

    return new_id


def main():
    parser = argparse.ArgumentParser(description='SAIDify KERI schemas')
    parser.add_argument('files', nargs='*', help='Schema files to process')
    parser.add_argument('--all', action='store_true', help='Process all matou-*.json files')
    args = parser.parse_args()

    script_dir = Path(__file__).parent

    if args.all:
        files = sorted(script_dir.glob('matou-*.json'))
    elif args.files:
        files = [Path(f) for f in args.files]
    else:
        parser.print_help()
        return

    results = {}
    for f in files:
        try:
            said = saidify_file(f)
            results[f.stem] = said
        except Exception as e:
            print(f"  Error: {e}")

    if results:
        print("\n=== SAIDs for code ===\n")
        for name, said in results.items():
            const_name = name.replace('matou-', '').replace('-', '_').upper()
            if '_SCHEMA' not in const_name:
                const_name += '_SAID'
            else:
                const_name = const_name.replace('_SCHEMA', '_SCHEMA_SAID')
            print(f"const {const_name} = '{said}';")


if __name__ == '__main__':
    main()
