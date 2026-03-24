"""Jinja utilities for Variant Bulk Creation print formats."""

from __future__ import annotations

from markupsafe import Markup


def render_item_image(image_path, max_height="80px", max_width="120px"):
    """Convert an image file path to an <img> tag for use in print formats.

    Usage in Jinja print format::

        {{ render_item_image(row.image) }}

    Or with custom size::

        {{ render_item_image(row.image, "100px", "150px") }}
    """
    if not image_path or str(image_path).startswith("<"):
        return image_path or ""

    return Markup(
        '<img src="{path}" style="max-height:{h}; max-width:{w};">'.format(
            path=image_path, h=max_height, w=max_width
        )
    )
