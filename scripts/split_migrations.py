#!/usr/bin/env python3
"""
Split multi-statement Supabase migration files into single-statement files.
Uses zero-padded numeric suffixes for correct sort order.
Original file is renamed to _000, splits get _001, _002, etc.
"""

import os
import re
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
MIN_TIMESTAMP = '20260218'


def parse_statements(sql: str) -> list[str]:
    """Split SQL into top-level statements, respecting dollar-quoting."""
    statements = []
    in_dollar_quote = False
    dollar_tag = ''
    pos = 0
    stmt_start = 0
    text = sql

    while pos < len(text):
        if text[pos] == '$':
            match = re.match(r'\$([a-zA-Z_]*)\$', text[pos:])
            if match:
                tag = match.group(0)
                if not in_dollar_quote:
                    in_dollar_quote = True
                    dollar_tag = tag
                    pos += len(tag)
                    continue
                elif tag == dollar_tag:
                    in_dollar_quote = False
                    dollar_tag = ''
                    pos += len(tag)
                    continue

        if not in_dollar_quote and text[pos:pos+2] == '--':
            newline = text.find('\n', pos)
            pos = len(text) if newline == -1 else newline + 1
            continue

        if not in_dollar_quote and text[pos:pos+2] == '/*':
            end = text.find('*/', pos + 2)
            pos = len(text) if end == -1 else end + 2
            continue

        if not in_dollar_quote and text[pos] == ';':
            stmt = text[stmt_start:pos+1].strip()
            if stmt and stmt != ';':
                statements.append(stmt)
            stmt_start = pos + 1
            pos += 1
            continue

        pos += 1

    remaining = text[stmt_start:].strip()
    if remaining:
        lines = [l.strip() for l in remaining.split('\n') if l.strip()]
        non_comment = [l for l in lines if not l.startswith('--')]
        if non_comment:
            statements.append(remaining)

    return statements


def split_migration(filepath: str) -> int:
    """Split a migration file. Renames original to _000, creates _001, _002, etc."""
    with open(filepath, 'r') as f:
        content = f.read()

    statements = parse_statements(content)
    if len(statements) <= 1:
        return 0

    basename = os.path.basename(filepath)
    dirname = os.path.dirname(filepath)
    name_no_ext = basename.rsplit('.', 1)[0]
    timestamp = name_no_ext.split('_')[0]
    rest = name_no_ext[len(timestamp):]  # e.g., "_uuid-here" or "_descriptive_name"

    # Rename original file to _000 (first statement)
    new_base = f"{timestamp}_000{rest}.sql"
    new_base_path = os.path.join(dirname, new_base)

    # Write first statement to _000 file
    with open(new_base_path, 'w') as f:
        f.write(statements[0] + '\n')

    # Remove the original file (it's now _000)
    os.remove(filepath)

    # Write remaining statements to _001, _002, etc.
    for i, stmt in enumerate(statements[1:], 1):
        new_name = f"{timestamp}_{i:03d}{rest}.sql"
        new_path = os.path.join(dirname, new_name)
        with open(new_path, 'w') as f:
            f.write(stmt + '\n')

    return len(statements) - 1


def main():
    migrations_dir = os.path.abspath(MIGRATIONS_DIR)
    if not os.path.isdir(migrations_dir):
        print(f"Error: {migrations_dir} not found")
        sys.exit(1)

    files = sorted(f for f in os.listdir(migrations_dir)
                   if f.endswith('.sql') and f[:8] >= MIN_TIMESTAMP[:8])

    # Only process original files (pure digit timestamps, no _NNN suffix)
    original_files = []
    for fname in files:
        timestamp = fname.split('_')[0]
        if timestamp.isdigit():
            original_files.append(fname)

    total_split = 0
    total_created = 0

    for fname in original_files:
        filepath = os.path.join(migrations_dir, fname)
        if not os.path.exists(filepath):
            continue

        with open(filepath, 'r') as f:
            content = f.read()

        stmts = parse_statements(content)
        if len(stmts) > 1:
            created = split_migration(filepath)
            if created > 0:
                total_split += 1
                total_created += created
                print(f"  Split {fname}: {len(stmts)} stmts -> {created + 1} files")

    # Verify sort order
    all_files = sorted(f for f in os.listdir(migrations_dir) if f.endswith('.sql'))
    print(f"\nDone: {total_split} files split, {total_created} new files created")
    print(f"Total migration files: {len(all_files)}")


if __name__ == '__main__':
    main()
