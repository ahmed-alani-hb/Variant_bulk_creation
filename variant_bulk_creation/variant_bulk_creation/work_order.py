"""Work Order helpers for populating total_pcs in Stock Entry."""

from __future__ import annotations

from typing import Optional

import frappe


def populate_total_pcs_in_stock_entry(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Stock Entry Detail from Work Order Item.

    This function is called before a Stock Entry is saved when it's generated
    from a Work Order. It copies the total_pcs value from Work Order Item to
    the corresponding Stock Entry Detail.
    """

    # Only process Stock Entry documents that have a work_order reference
    if doc.doctype != "Stock Entry" or not doc.get("work_order"):
        return

    work_order_name = doc.get("work_order")

    # Get the Work Order document
    try:
        work_order = frappe.get_doc("Work Order", work_order_name)
    except Exception:
        # Work Order might not exist or be accessible
        return

    # Create a mapping of item_code to total_pcs from Work Order
    wo_item_pcs_map = {}

    # Get total_pcs from the required items (finished goods)
    for item_row in work_order.get("required_items", []):
        if item_row.get("total_pcs"):
            wo_item_pcs_map[item_row.item_code] = item_row.total_pcs

    # Also check the production item (finished good)
    if work_order.get("total_pcs"):
        wo_item_pcs_map[work_order.production_item] = work_order.total_pcs

    # Copy total_pcs to Stock Entry Detail rows
    for se_item in doc.get("items", []):
        item_code = se_item.item_code
        if item_code in wo_item_pcs_map and not se_item.get("total_pcs"):
            se_item.total_pcs = wo_item_pcs_map[item_code]
