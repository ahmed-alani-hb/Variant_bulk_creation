"""Stock Reconciliation helpers for populating total_pcs in Stock Ledger Entry and variant creation."""

from __future__ import annotations

from typing import Optional

import frappe

# Import variant materialization from sales_order module to reuse the logic
from .sales_order import _materialise_variant


def populate_total_pcs_in_stock_ledger(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Stock Ledger Entry from Stock Reconciliation Item.

    This function is called when a Stock Reconciliation is submitted and Stock Ledger Entries
    are created. It copies the total_pcs value from Stock Reconciliation Item to the
    corresponding Stock Ledger Entry.
    """

    # Only process Stock Reconciliation documents
    if doc.doctype != "Stock Reconciliation":
        return

    # Get all Stock Reconciliation Item rows
    for item_row in doc.get("items", []):
        total_pcs = item_row.get("total_pcs")

        # Skip if no total_pcs value
        if not total_pcs:
            continue

        # Find corresponding Stock Ledger Entries for this item
        # Stock Ledger Entries are created with voucher_type="Stock Reconciliation" and voucher_no=doc.name
        sle_list = frappe.get_all(
            "Stock Ledger Entry",
            filters={
                "voucher_type": "Stock Reconciliation",
                "voucher_no": doc.name,
                "item_code": item_row.item_code,
                "voucher_detail_no": item_row.name,
            },
            pluck="name"
        )

        # Update each Stock Ledger Entry with total_pcs
        for sle_name in sle_list:
            frappe.db.set_value("Stock Ledger Entry", sle_name, "total_pcs", total_pcs, update_modified=False)


@frappe.whitelist()
def resolve_stock_reconciliation_variant(
    template_item: str,
    sticker: Optional[str] = None,
    powder_code: Optional[str] = None,
    length: Optional[float] = None,
) -> dict[str, Optional[str]]:
    """Return the resolved variant details for Stock Reconciliation client-side population.

    This function is called from the Stock Reconciliation form when users select variant
    attributes (template, powder code, sticker, length). It creates or retrieves
    the variant and returns its details for populating the Stock Reconciliation Item row.
    """

    variant_doc = _materialise_variant(
        template_item=template_item,
        sticker=sticker,
        powder_code=powder_code,
        length=length,
    )

    return {
        "item_code": variant_doc.name,
        "item_name": variant_doc.get("item_name"),
    }
