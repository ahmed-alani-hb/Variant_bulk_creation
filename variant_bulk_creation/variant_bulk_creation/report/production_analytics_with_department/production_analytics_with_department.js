// Copyright (c) 2024, Custom and contributors
// For license information, please see license.txt

frappe.query_reports["Production Analytics with Department"] = {
	"filters": [
		{
			"fieldname": "company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "department",
			"label": __("Department"),
			"fieldtype": "Link",
			"options": "Department"
		},
		{
			"fieldname": "production_item",
			"label": __("Production Item"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Department\nProduction Item\nStatus",
			"default": "Department"
		}
	],
	"formatter": function(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname == "efficiency" && data && data.efficiency) {
			if (data.efficiency >= 100) {
				value = "<span style='color:green'>" + value + "</span>";
			} else if (data.efficiency >= 80) {
				value = "<span style='color:orange'>" + value + "</span>";
			} else {
				value = "<span style='color:red'>" + value + "</span>";
			}
		}

		return value;
	}
};
