"""Sales Order helpers for Variant Bulk Creation."""

from __future__ import annotations

import re
from typing import Optional

import frappe
from frappe import _

try:
    from erpnext.controllers.item_variant import create_variant, get_variant
except ImportError as exc:  # pragma: no cover - ERPNext not available during tests
    raise ImportError(
        "Variant Bulk Creation requires ERPNext to resolve Sales Order variants."
    ) from exc


def _get_template_attributes(template_item: str) -> dict:
    """Return all variant attributes for the provided template item."""
    if not template_item:
        frappe.throw(_("Template Item is required."))

    item = frappe.get_doc("Item", template_item)
    if not item.has_variants:
        frappe.throw(
            _("Template {0} is not configured to create variants.").format(
                frappe.bold(item.name)
            )
        )

    attributes = {}
    for row in item.get("attributes", []):
        if row.get("attribute"):
            attr_name = row.attribute
            allowed_values = frappe.get_all(
                "Item Attribute Value",
                filters={"parent": attr_name},
                fields=["attribute_value", "abbr"],
                order_by="idx asc",
            )
            attributes[attr_name] = {
                "values": [v.attribute_value for v in allowed_values],
                "abbr_map": {v.attribute_value: v.abbr for v in allowed_values if v.abbr},
            }

    return attributes


def _extract_length_from_attribute(attribute_value: str) -> Optional[float]:
    """Extract numeric length value from attribute string (e.g., '6m' -> 6.0)."""
    if not attribute_value:
        return None
    match = re.search(r"(\d+\.?\d*)", str(attribute_value))
    if match:
        try:
            return float(match[1])
        except (ValueError, IndexError):
            return None
    return None


def _detect_sticker_from_attribute(attribute_value: str) -> bool:
    """Detect if the attribute value indicates sticker presence (any value except 'No sticker')."""
    if not attribute_value:
        return False
    attr_lower = str(attribute_value).strip().lower()
    return attr_lower != 'no sticker'


def _calculate_weight_for_variant(
    template_item: str,
    length: Optional[float],
    sticker: Optional[str],
) -> Optional[dict]:
    """Calculate weight based on template kg/meter values and variant attributes.

    Returns:
        Dictionary with weight_per_unit (pcs/kg), weight_per_piece (kg/piece),
        and weight_uom, or None if calculation not possible.
    """
    if not template_item or length is None:
        return None

    template = frappe.get_doc("Item", template_item)
    has_sticker = _detect_sticker_from_attribute(sticker) if sticker else False

    kg_per_meter = (
        template.get("weight_per_meter_with_sticker") if has_sticker
        else template.get("weight_per_meter_no_sticker")
    )

    if not kg_per_meter:
        return None

    try:
        weight_per_piece = float(length) * float(kg_per_meter)
        if weight_per_piece == 0:
            return None
        pieces_per_kg = 1 / weight_per_piece
    except (ValueError, TypeError, ZeroDivisionError):
        return None

    return {
        "weight_per_unit": pieces_per_kg,
        "weight_per_piece": weight_per_piece,
        "weight_uom": "Kg"
    }


def _update_variant_weight_and_image(variant_doc, template_item, weight_info):
    """Set weight_per_unit and image on the variant Item so ERPNext copies them
    to transaction rows automatically."""
    needs_save = False
    template_doc = frappe.get_doc("Item", template_item)

    # Copy image from template if variant has no image
    if template_doc.get("image") and not variant_doc.get("image"):
        variant_doc.image = template_doc.image
        needs_save = True

    # Set weight_per_unit (pieces_per_kg) on the variant Item itself.
    # When ERPNext fetches item details for a SO/DN row, it copies this value,
    # so total_weight = weight_per_unit * qty = pieces_per_kg * qty_in_kg = total_pcs
    if weight_info:
        current_wpu = variant_doc.get("weight_per_unit") or 0
        new_wpu = weight_info["weight_per_unit"]
        if abs(current_wpu - new_wpu) > 0.0001:
            variant_doc.weight_per_unit = new_wpu
            variant_doc.weight_uom = weight_info["weight_uom"]
            needs_save = True

    if needs_save:
        variant_doc.flags.ignore_permissions = True
        variant_doc.save()


def _materialise_variant(
    template_item: str,
    sticker: Optional[str] = None,
    powder_code: Optional[str] = None,
    length=None,
):
    """Return an Item document for the requested variant, creating it if needed.

    If the variant already exists, it is returned silently without any message.
    Also copies template image and sets weight_per_unit on the variant.
    """

    if not all([sticker, powder_code, length is not None]):
        frappe.throw(
            _("All attributes (Powder Code, Length, and Sticker) must be provided for template {0}.").format(
                frappe.bold(template_item)
            )
        )

    template_attributes = _get_template_attributes(template_item)

    args = {}
    matched_sticker = False
    matched_powder = False
    matched_length = False

    for attr_name, attr_data in template_attributes.items():
        attr_lower = attr_name.lower()

        if 'sticker' in attr_lower and sticker:
            if sticker not in attr_data['values']:
                frappe.throw(
                    _("Sticker value {0} is not valid for template {1}.").format(
                        frappe.bold(sticker), frappe.bold(template_item)
                    )
                )
            args[attr_name] = sticker
            matched_sticker = True
        elif 'powder' in attr_lower and powder_code:
            if powder_code not in attr_data['values']:
                frappe.throw(
                    _("Powder Code value {0} is not valid for template {1}.").format(
                        frappe.bold(powder_code), frappe.bold(template_item)
                    )
                )
            args[attr_name] = powder_code
            matched_powder = True
        elif 'length' in attr_lower and length is not None:
            args[attr_name] = length
            matched_length = True

    if not all([matched_sticker, matched_powder, matched_length]):
        missing = []
        if not matched_sticker:
            missing.append("Sticker")
        if not matched_powder:
            missing.append("Powder Code")
        if not matched_length:
            missing.append("Length")

        frappe.throw(
            _("Template {0} is missing required attributes: {1}").format(
                frappe.bold(template_item),
                ", ".join(missing)
            )
        )

    # Calculate weight for this variant
    numeric_length = length
    if numeric_length is not None:
        try:
            numeric_length = float(numeric_length)
        except (ValueError, TypeError):
            numeric_length = None
    weight_info = _calculate_weight_for_variant(template_item, numeric_length, sticker)

    # Try to find existing variant
    variant_name = get_variant(template_item, args)
    if variant_name:
        variant_doc = frappe.get_doc("Item", variant_name)
        _update_variant_weight_and_image(variant_doc, template_item, weight_info)
        return variant_doc

    # Create the variant doc (unsaved)
    variant_doc = create_variant(template_item, args)
    if isinstance(variant_doc, str):
        variant_doc = frappe.get_doc("Item", variant_doc)
        _update_variant_weight_and_image(variant_doc, template_item, weight_info)
        return variant_doc

    # variant_doc.name is None until insert(); use item_code to check
    # if the variant already exists (get_variant may miss it due to
    # numeric formatting differences in attribute lookup)
    variant_item_code = variant_doc.item_code or variant_doc.item_name
    if variant_item_code and frappe.db.exists("Item", variant_item_code):
        variant_doc = frappe.get_doc("Item", variant_item_code)
        _update_variant_weight_and_image(variant_doc, template_item, weight_info)
        return variant_doc

    # Copy image from template before insert
    template_doc = frappe.get_doc("Item", template_item)
    if template_doc.get("image"):
        variant_doc.image = template_doc.image

    # Set weight on the variant before insert
    if weight_info:
        variant_doc.weight_per_unit = weight_info["weight_per_unit"]
        variant_doc.weight_uom = weight_info["weight_uom"]

    # Insert new variant, catch duplicate in case of race condition
    try:
        variant_doc.flags.ignore_permissions = True
        variant_doc.insert()
        variant_doc.reload()
    except frappe.DuplicateEntryError:
        frappe.clear_last_message()
        variant_doc = frappe.get_doc("Item", variant_item_code)
        _update_variant_weight_and_image(variant_doc, template_item, weight_info)

    return variant_doc


def ensure_sales_order_variants(doc, _event: Optional[str] = None) -> None:
    """Populate Sales Order item codes from template and attribute selections.

    Reads from non-prefixed custom fields on Sales Order Item:
    template_item, sticker, powder_code, length.
    """

    for row in doc.get("items", []):
        template_item = row.get("template_item")
        sticker = row.get("sticker")
        powder_code = row.get("powder_code")
        length = row.get("length")

        if not template_item:
            continue

        if not all([sticker, powder_code, length is not None]):
            continue

        try:
            variant_doc = _materialise_variant(
                template_item=template_item,
                sticker=sticker,
                powder_code=powder_code,
                length=length,
            )
        except Exception:
            frappe.log_error(
                title="Variant Bulk Creation - Sales Order",
                message=frappe.get_traceback(),
            )
            frappe.throw(
                _(
                    "Unable to create or locate variant for template {0}."
                ).format(frappe.bold(template_item))
            )

        row.item_code = variant_doc.name

        if hasattr(row, "item_name") and variant_doc.get("item_name"):
            row.item_name = variant_doc.item_name
        if hasattr(row, "description") and variant_doc.get("description"):
            row.description = variant_doc.description

        if hasattr(row, "uom") and variant_doc.get("stock_uom"):
            row.uom = variant_doc.stock_uom
            row.stock_uom = variant_doc.stock_uom

        if hasattr(row, "conversion_factor") and not row.get("conversion_factor"):
            row.conversion_factor = 1

        # weight_per_unit is now set on the variant Item itself, so ERPNext
        # copies it automatically. But also set it on the row for safety.
        if variant_doc.get("weight_per_unit"):
            row.weight_per_unit = variant_doc.weight_per_unit
            row.weight_uom = variant_doc.get("weight_uom") or "Kg"

        # If total_weight was entered (as total pcs), recalculate qty
        total_weight = row.get("total_weight")
        if total_weight and row.weight_per_unit:
            weight_per_piece = 1 / row.weight_per_unit
            row.qty = total_weight * weight_per_piece


def _sales_order_before_print(doc, method=None, settings=None):
    """Convert image paths to <img> tags for print rendering.

    Uses markupsafe.Markup so Jinja does not auto-escape the HTML.
    """
    from markupsafe import Markup

    for row in doc.get("items", []):
        image = row.get("image")
        if image and not str(image).startswith("<"):
            row.image = Markup(
                '<img src="{0}" style="max-height:80px; max-width:120px;">'.format(image)
            )


@frappe.whitelist()
def get_template_attribute(template_item: str) -> dict:
    """Return all variant attributes configured on the given template item."""

    attributes = _get_template_attributes(template_item)

    main_attribute = next(iter(attributes.keys())) if attributes else None

    return {
        "attribute": main_attribute,
        "all_attributes": list(attributes.keys()),
    }


@frappe.whitelist()
def resolve_sales_order_variant(
    template_item: str,
    sticker: Optional[str] = None,
    powder_code: Optional[str] = None,
    length=None,
) -> dict:
    """Return the resolved variant details for client-side population."""

    if length is not None:
        try:
            length = float(length)
        except (ValueError, TypeError):
            pass

    variant_doc = _materialise_variant(
        template_item=template_item,
        sticker=sticker,
        powder_code=powder_code,
        length=length,
    )

    result = {
        "item_code": variant_doc.name,
        "item_name": variant_doc.get("item_name"),
        "description": variant_doc.get("description"),
        "stock_uom": variant_doc.get("stock_uom"),
        "conversion_factor": 1,
        "image": variant_doc.get("image"),
    }

    # weight_per_unit is now set on the variant Item itself
    if variant_doc.get("weight_per_unit"):
        result["weight_per_unit"] = variant_doc.weight_per_unit
        weight_per_piece = 1 / variant_doc.weight_per_unit
        result["weight_per_piece"] = weight_per_piece

    return result
