# Production Analytics with Department

This report provides aggregated analytics and insights on production performance with department tracking and piece-level metrics.

## Features

- **Flexible Grouping**: Group data by Department, Production Item, or Status
- **Piece-Level Analytics**: Track both quantity and pieces for comprehensive insights
- **Efficiency Metrics**: Calculate production efficiency with color-coded indicators
- **Visual Charts**: Bar charts showing planned vs produced quantities
- **Status Breakdown**: See distribution of work orders by status
- **Department Performance**: Compare production across different departments

## Filters

- **Company** (required): Filter by company
- **From Date** (required): Start date for planned start date range
- **To Date** (required): End date for planned start date range
- **Department** (optional): Filter by specific department
- **Production Item** (optional): Filter by specific production item
- **Group By**: Choose grouping (Department, Production Item, or Status)

## Columns

- **Grouping Field**: Department, Production Item, or Status (based on Group By selection)
- **Total Work Orders**: Count of work orders in the group
- **Planned Qty**: Total planned quantity to manufacture
- **Planned Pieces**: Total planned pieces to manufacture
- **Produced Qty**: Total quantity actually produced
- **Produced Pieces**: Total pieces actually produced
- **Qty Variance**: Difference between planned and produced quantity
- **Pcs Variance**: Difference between planned and produced pieces
- **Efficiency %**: Production efficiency (produced / planned × 100)
  - Green: ≥ 100%
  - Orange: 80-99%
  - Red: < 80%
- **Completed Orders**: Count of completed work orders
- **In Process Orders**: Count of in-process work orders
- **Not Started Orders**: Count of not started work orders

## Use Cases

1. **Department Comparison**: Compare production efficiency across departments
2. **Item Performance**: Identify which items have better production rates
3. **Status Overview**: Get a bird's eye view of work order status distribution
4. **Production Planning**: Use historical efficiency data for better planning
5. **Piece-Level Insights**: Monitor production at the piece level for products where piece count matters

## Charts

The report includes an interactive bar chart comparing:
- Planned Qty vs Produced Qty
- Grouped by the selected grouping dimension
