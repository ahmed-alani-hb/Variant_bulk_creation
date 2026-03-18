# SPDX-License-Identifier: MIT
"""Patch formerly used to create vbc_ prefixed fields on Sales Order Item.

These fields are now managed via fixtures with non-prefixed names
(template_item, powder_code, length, sticker). This patch is a no-op.
"""


def execute():
    pass
