# Copyright (c) 2024, Custom and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "fieldname": "work_order",
            "label": _("Work Order"),
            "fieldtype": "Link",
            "options": "Work Order",
            "width": 150
        },
        {
            "fieldname": "department",
            "label": _("Department"),
            "fieldtype": "Link",
            "options": "Department",
            "width": 120
        },
        {
            "fieldname": "production_item",
            "label": _("Production Item"),
            "fieldtype": "Link",
            "options": "Item",
            "width": 150
        },
        {
            "fieldname": "item_code",
            "label": _("Item Code"),
            "fieldtype": "Link",
            "options": "Item",
            "width": 150
        },
        {
            "fieldname": "item_name",
            "label": _("Item Name"),
            "fieldtype": "Data",
            "width": 150
        },
        {
            "fieldname": "type",
            "label": _("Type"),
            "fieldtype": "Data",
            "width": 100
        },
        {
            "fieldname": "required_qty",
            "label": _("Required Qty"),
            "fieldtype": "Float",
            "width": 110
        },
        {
            "fieldname": "consumed_qty",
            "label": _("Consumed Qty"),
            "fieldtype": "Float",
            "width": 110
        },
        {
            "fieldname": "variance",
            "label": _("Variance"),
            "fieldtype": "Float",
            "width": 110
        },
        {
            "fieldname": "stock_uom",
            "label": _("UOM"),
            "fieldtype": "Link",
            "options": "UOM",
            "width": 80
        }
    ]


def get_data(filters):
    conditions = get_conditions(filters)

    # Get required items from Work Orders
    required_items = frappe.db.sql("""
        SELECT
            wo.name as work_order,
            wo.department,
            wo.production_item,
            woi.item_code,
            woi.item_name,
            'Required' as type,
            woi.required_qty,
            0 as consumed_qty,
            0 as variance,
            woi.stock_uom
        FROM `tabWork Order` wo
        INNER JOIN `tabWork Order Item` woi ON woi.parent = wo.name
        WHERE wo.docstatus = 1 {conditions}
    """.format(conditions=conditions), filters, as_dict=1)

    # Get consumed items from Stock Entries
    consumed_items = frappe.db.sql("""
        SELECT
            se.work_order,
            wo.department,
            wo.production_item,
            sed.item_code,
            sed.item_name,
            'Consumed' as type,
            0 as required_qty,
            SUM(sed.qty) as consumed_qty,
            0 as variance,
            sed.stock_uom
        FROM `tabStock Entry` se
        INNER JOIN `tabStock Entry Detail` sed ON sed.parent = se.name
        INNER JOIN `tabWork Order` wo ON wo.name = se.work_order
        WHERE se.docstatus = 1
            AND se.purpose = 'Manufacture'
            AND se.work_order IS NOT NULL
            AND sed.s_warehouse IS NOT NULL
            {conditions}
        GROUP BY se.work_order, sed.item_code
    """.format(conditions=conditions.replace('wo.', 'wo.')), filters, as_dict=1)

    # Get scrap items from Work Orders
    scrap_items = frappe.db.sql("""
        SELECT
            wo.name as work_order,
            wo.department,
            wo.production_item,
            wos.item_code,
            wos.item_name,
            'Scrap' as type,
            0 as required_qty,
            wos.stock_qty as consumed_qty,
            0 as variance,
            wos.stock_uom
        FROM `tabWork Order` wo
        INNER JOIN `tabWork Order Scrap Item` wos ON wos.parent = wo.name
        WHERE wo.docstatus = 1 {conditions}
    """.format(conditions=conditions), filters, as_dict=1)

    # Combine and calculate variance
    data = []
    item_map = {}

    # Process required items
    for item in required_items:
        key = (item.work_order, item.item_code)
        item_map[key] = item
        data.append(item)

    # Process consumed items
    for item in consumed_items:
        key = (item.work_order, item.item_code)
        if key in item_map:
            item_map[key]['consumed_qty'] = item.consumed_qty
            item_map[key]['variance'] = item.consumed_qty - item_map[key]['required_qty']
        else:
            data.append(item)

    # Add scrap items
    data.extend(scrap_items)

    return data


def get_conditions(filters):
    conditions = []

    if filters.get("from_date"):
        conditions.append("wo.creation >= %(from_date)s")

    if filters.get("to_date"):
        conditions.append("wo.creation <= %(to_date)s")

    if filters.get("company"):
        conditions.append("wo.company = %(company)s")

    if filters.get("work_order"):
        conditions.append("wo.name = %(work_order)s")

    if filters.get("department"):
        conditions.append("wo.department = %(department)s")

    return " AND " + " AND ".join(conditions) if conditions else ""
