"""Sales Order helpers for Variant Bulk Creation."""

from __future__ import annotations

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
            # Get allowed values for this attribute
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


def _materialise_variant(
    template_item: str,
    sticker: Optional[str] = None,
    powder_code: Optional[str] = None,
    length: Optional[float] = None,
):
    """Return an Item document for the requested variant, creating it if needed.

    Args:
        template_item: The template item code
        sticker: The sticker attribute value
        powder_code: The powder code attribute value
        length: The numeric length value (for numeric attributes)
    """

    # Require all three attributes to be provided
    if not all([sticker, powder_code, length is not None]):
        frappe.throw(
            _("All attributes (Powder Code, Length, and Sticker) must be provided for template {0}.").format(
                frappe.bold(template_item)
            )
        )

    template_attributes = _get_template_attributes(template_item)

    # Build args dict with all provided attribute values
    args = {}

    # Track which attributes we've matched
    matched_sticker = False
    matched_powder = False
    matched_length = False

    # Match provided values with template attributes
    for attr_name, attr_data in template_attributes.items():
        # Try to match by attribute name (case-insensitive contains check)
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
            # Length is a numeric attribute - pass the number directly
            args[attr_name] = length
            matched_length = True

    # Verify all three attributes were matched
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

    variant_name = get_variant(template_item, args)
    if variant_name:
        return frappe.get_doc("Item", variant_name)

    variant_doc = create_variant(template_item, args)
    if isinstance(variant_doc, str):
        variant_doc = frappe.get_doc("Item", variant_doc)

    if not frappe.db.exists("Item", variant_doc.name):
        variant_doc.flags.ignore_permissions = True
        variant_doc.insert()
        variant_doc.reload()

    return variant_doc


def ensure_sales_order_variants(doc, _event: Optional[str] = None) -> None:
    """Populate Sales Order item codes from template and attribute selections."""

    for row in doc.get("items", []):
        template_item = row.get("template_item")
        sticker = row.get("sticker")
        powder_code = row.get("powder_code")
        length = row.get("length")

        # Skip if no template selected
        if not template_item:
            continue

        # Skip if ALL attributes are not provided (require all three)
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


@frappe.whitelist()
def get_template_attribute(template_item: str) -> dict:
    """Return all variant attributes configured on the given template item."""

    attributes = _get_template_attributes(template_item)

    # Return the first attribute as the main one for backward compatibility
    # This is used by the JavaScript to populate the attribute_value field
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
    length: Optional[float] = None,
) -> dict[str, Optional[str]]:
    """Return the resolved variant details for client-side population."""

    variant_doc = _materialise_variant(
        template_item=template_item,
        sticker=sticker,
        powder_code=powder_code,
        length=length,
    )

    return {
        "item_code": variant_doc.name,
        "item_name": variant_doc.get("item_name"),
        "description": variant_doc.get("description"),
        "stock_uom": variant_doc.get("stock_uom"),
        "conversion_factor": 1,
    }
