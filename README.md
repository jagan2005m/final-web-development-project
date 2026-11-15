# Responsive Sales Dashboard

A responsive sales analytics dashboard built with HTML, CSS, JavaScript and Chart.js.

## Project files
- `index.html` - semantic page structure
- `style.css` - layout, visual styling and responsive media queries
- `script.js` - CSV loading, filtering, calculations, DOM updates and charts
- `data/sales.csv` - your sales dataset (copy your existing CSV here)

## Run locally
1. Keep your existing `sales.csv` file inside the `data` folder.
2. Open this project folder in VS Code.
3. Run `index.html` using the Live Server extension.

The dashboard expects CSV headers such as `Date`, `Branch`, `Category`, `Sales`, `Profit`, and `Payment`. It also uses `Invoice ID` if present to count unique orders.
