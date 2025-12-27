"""Delivery Note helpers for populating total_pcs in Stock Ledger Entry."""

from __future__ import annotations

from typing import Optional

import frappe


def populate_total_pcs_in_stock_ledger(doc, _event: Optional[str] = None) -> None:
    """Populate total_pcs in Stock Ledger Entry from Delivery Note Item.

    This function is called when a Delivery Note is submitted and Stock Ledger Entries
    are created. It copies the total_pcs value from Delivery Note Item to the
    corresponding Stock Ledger Entry.
    """

    # Only process Delivery Note documents
    if doc.doctype != "Delivery Note":
        return

    # Get all Delivery Note Item rows
    for item_row in doc.get("items", []):
        total_pcs = item_row.get("total_pcs")

        # Skip if no total_pcs value
        if not total_pcs:
            continue

        # Find corresponding Stock Ledger Entries for this item
        # Stock Ledger Entries are created with voucher_type="Delivery Note" and voucher_no=doc.name
        sle_list = frappe.get_all(
            "Stock Ledger Entry",
            filters={
                "voucher_type": "Delivery Note",
                "voucher_no": doc.name,
                "item_code": item_row.item_code,
                "voucher_detail_no": item_row.name,
            },
            pluck="name"
        )

        # Update each Stock Ledger Entry with total_pcs
        for sle_name in sle_list:
            frappe.db.set_value("Stock Ledger Entry", sle_name, "total_pcs", total_pcs, update_modified=False)
