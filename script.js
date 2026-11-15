// Sales Dashboard - data, filters, calculations and interactive charts
let salesData = [];
let salesChart = null;
let categoryChart = null;
let branchChart = null;
let paymentChart = null;

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", loadSalesData);

// Load the CSV file from the data folder.
async function loadSalesData() {
  const status = document.getElementById("dataStatus");

  try {
    const response = await fetch("data/sales.csv");
    if (!response.ok) {
      throw new Error(`Could not load data/sales.csv (HTTP ${response.status}).`);
    }

    const csvText = await response.text();
    salesData = parseCSV(csvText);

    if (salesData.length === 0) {
      throw new Error("The CSV file does not contain any sales records.");
    }

    setupFilters(salesData);
    attachEvents();
    updateDashboard(salesData);
    renderSalesRecords();
    status.textContent = `${salesData.length} records loaded successfully.`;
  } catch (error) {
    console.error("Sales data loading error:", error);
    status.textContent = "Unable to load sales data. Check that data/sales.csv exists and run the site using Live Server.";
  }
}

// Parse CSV rows while respecting commas inside quoted values.
function parseCSV(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(header => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function getField(record, possibleNames) {
  const foundKey = Object.keys(record).find(key =>
    possibleNames.some(name => key.toLowerCase() === name.toLowerCase())
  );
  return foundKey ? record[foundKey] : "";
}

function getNumber(record, fieldNames) {
  const rawValue = String(getField(record, fieldNames)).replace(/[^0-9.-]/g, "");
  return Number.parseFloat(rawValue) || 0;
}

// Populate category and branch dropdowns from the CSV data.
function setupFilters(data) {
  const categoryFilter = document.getElementById("categoryFilter");
  const branchFilter = document.getElementById("branchFilter");

  const categories = [...new Set(data.map(row => getField(row, ["Category"])).filter(Boolean))].sort();
  const branches = [...new Set(data.map(row => getField(row, ["Branch"])).filter(Boolean))].sort();

  categories.forEach(category => addOption(categoryFilter, category));
  branches.forEach(branch => addOption(branchFilter, branch));
}

function addOption(selectElement, value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  selectElement.appendChild(option);
}

// Attach change, input and click events.
function attachEvents() {
  document.getElementById("categoryFilter").addEventListener("change", applyFilters);
  document.getElementById("branchFilter").addEventListener("change", applyFilters);
  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("resetFilters").addEventListener("click", resetFilters);
}

function applyFilters() {
  const selectedCategory = document.getElementById("categoryFilter").value;
  const selectedBranch = document.getElementById("branchFilter").value;
  const searchTerm = document.getElementById("searchInput").value.trim().toLowerCase();

  const filteredData = salesData.filter(record => {
    const category = getField(record, ["Category"]);
    const branch = getField(record, ["Branch"]);
    const searchableText = [
      getField(record, ["Invoice ID", "Invoice_ID", "Invoice"]),
      getField(record, ["Customer", "Customer Name"]),
      getField(record, ["Product", "Product line"]),
      category,
      branch
    ].join(" ").toLowerCase();

    return (selectedCategory === "All" || category === selectedCategory) &&
      (selectedBranch === "All" || branch === selectedBranch) &&
      (!searchTerm || searchableText.includes(searchTerm));
  });

  updateDashboard(filteredData);
  document.getElementById("dataStatus").textContent =
    `Showing ${filteredData.length} of ${salesData.length} records.`;
}

function resetFilters() {
  document.getElementById("categoryFilter").value = "All";
  document.getElementById("branchFilter").value = "All";
  document.getElementById("searchInput").value = "";
  applyFilters();
}

// Calculate totals and refresh all dashboard elements.
function updateDashboard(data) {
  const totalSales = data.reduce((sum, row) => sum + getNumber(row, ["Sales", "Total"]), 0);
  const totalProfit = data.reduce((sum, row) => sum + getNumber(row, ["Profit"]), 0);

  const invoiceIds = data
    .map(row => getField(row, ["Invoice ID", "Invoice_ID", "Invoice"]))
    .filter(Boolean);
  const totalOrders = invoiceIds.length ? new Set(invoiceIds).size : data.length;
  const averageOrderValue = totalOrders ? totalSales / totalOrders : 0;

  document.getElementById("totalSales").textContent = currencyFormatter.format(totalSales);
  document.getElementById("totalProfit").textContent = currencyFormatter.format(totalProfit);
  document.getElementById("totalOrders").textContent = totalOrders.toLocaleString("en-IN");
  document.getElementById("averageOrderValue").textContent = currencyFormatter.format(averageOrderValue);

  createSalesChart(data);
  createCategoryChart(data);
  createBranchChart(data);
  createPaymentChart(data);
}

function destroyChart(chart) {
  if (chart) chart.destroy();
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: context => ` ${currencyFormatter.format(context.parsed.y ?? context.parsed)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#778198" } },
      y: { beginAtZero: true, grid: { color: "#edf0f6" }, ticks: { color: "#778198" } }
    }
  };
}

function createSalesChart(data) {
  const monthlySales = {};

  data.forEach(row => {
    const rawDate = getField(row, ["Date"]);
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return;

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlySales[monthKey] = (monthlySales[monthKey] || 0) + getNumber(row, ["Sales", "Total"]);
  });

  const sortedMonths = Object.keys(monthlySales).sort();
  const labels = sortedMonths.map(key => {
    const [year, month] = key.split("-");
    return new Date(Number(year), Number(month) - 1, 1)
      .toLocaleString("en-IN", { month: "short", year: "numeric" });
  });

  destroyChart(salesChart);
  salesChart = new Chart(document.getElementById("salesChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Monthly Sales",
        data: sortedMonths.map(key => monthlySales[key]),
        borderColor: "#5b5ce2",
        backgroundColor: "rgba(91, 92, 226, .12)",
        pointBackgroundColor: "#5b5ce2",
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        tension: .35,
        fill: true
      }]
    },
    options: {
      ...chartBaseOptions(),
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${currencyFormatter.format(context.parsed.y)}` } } }
    }
  });
}

function createCategoryChart(data) {
  const totals = {};
  data.forEach(row => {
    const category = getField(row, ["Category"]) || "Unspecified";
    totals[category] = (totals[category] || 0) + getNumber(row, ["Sales", "Total"]);
  });

  destroyChart(categoryChart);
  categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "bar",
    data: {
      labels: Object.keys(totals),
      datasets: [{ label: "Sales", data: Object.values(totals), backgroundColor: "#818cf8", borderRadius: 7, maxBarThickness: 42 }]
    },
    options: {
      ...chartBaseOptions(),
      indexAxis: "y",
      scales: {
        x: { beginAtZero: true, grid: { color: "#edf0f6" }, ticks: { color: "#778198" } },
        y: { grid: { display: false }, ticks: { color: "#778198" } }
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${currencyFormatter.format(context.parsed.x)}` } } }
    }
  });
}

function createBranchChart(data) {
  const totals = {};
  data.forEach(row => {
    const branch = getField(row, ["Branch"]) || "Unspecified";
    totals[branch] = (totals[branch] || 0) + getNumber(row, ["Sales", "Total"]);
  });

  destroyChart(branchChart);
  branchChart = new Chart(document.getElementById("branchChart"), {
    type: "bar",
    data: {
      labels: Object.keys(totals),
      datasets: [{ label: "Sales", data: Object.values(totals), backgroundColor: "#34b3a0", borderRadius: 7, maxBarThickness: 48 }]
    },
    options: {
      ...chartBaseOptions(),
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${currencyFormatter.format(context.parsed.y)}` } } }
    }
  });
}

function createPaymentChart(data) {
  const totals = {};
  data.forEach(row => {
    const payment = getField(row, ["Payment", "Payment Method", "Payment_method"]) || "Unspecified";
    totals[payment] = (totals[payment] || 0) + getNumber(row, ["Sales", "Total"]);
  });

  destroyChart(paymentChart);
  paymentChart = new Chart(document.getElementById("paymentChart"), {
    type: "doughnut",
    data: {
      labels: Object.keys(totals),
      datasets: [{
        label: "Sales by payment method",
        data: Object.values(totals),
        backgroundColor: ["#5b5ce2", "#24a89a", "#f59e0b", "#e879a8", "#8b9bb4"],
        borderWidth: 3,
        borderColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { display: true, position: "bottom", labels: { usePointStyle: true, padding: 18, color: "#667085", font: { size: 11 } } },
        tooltip: { callbacks: { label: context => ` ${context.label}: ${currencyFormatter.format(context.parsed)}` } }
      }
    }
  });
}


// ===============================
// TASK 4: FORM VALIDATION + CRUD
// ===============================

// These records are kept in memory for the current browser session.
// Refreshing the page reloads the original CSV file.
document.addEventListener("DOMContentLoaded", attachRecordManagement);

function attachRecordManagement() {
  const form = document.getElementById("saleForm");
  if (!form) return;

  form.addEventListener("submit", handleSaleSubmit);
  document.getElementById("cancelEditButton").addEventListener("click", cancelSaleEdit);
  renderSalesRecords();
}

function handleSaleSubmit(event) {
  event.preventDefault(); // Stop the page from reloading.

  const form = event.currentTarget;
  const message = document.getElementById("formMessage");
  const salesAmount = Number(document.getElementById("saleAmount").value);
  const profitAmount = Number(document.getElementById("saleProfit").value);

  if (!form.checkValidity()) {
    form.reportValidity();
    message.textContent = "Please complete all required fields correctly.";
    message.classList.remove("success");
    return;
  }

  if (!Number.isFinite(salesAmount) || salesAmount <= 0) {
    message.textContent = "Sales amount must be greater than zero.";
    message.classList.remove("success");
    document.getElementById("saleAmount").focus();
    return;
  }

  if (!Number.isFinite(profitAmount) || profitAmount > salesAmount) {
    message.textContent = "Enter a valid profit amount that does not exceed sales.";
    message.classList.remove("success");
    document.getElementById("saleProfit").focus();
    return;
  }

  const sale = {
    "Date": document.getElementById("saleDate").value,
    "Branch": document.getElementById("saleBranch").value.trim(),
    "Category": document.getElementById("saleCategory").value.trim(),
    "Sales": String(salesAmount),
    "Profit": String(profitAmount),
    "Payment": document.getElementById("salePayment").value,
    "Customer": document.getElementById("saleCustomer").value.trim(),
    "Product": document.getElementById("saleProduct").value.trim(),
    "Invoice ID": `MANUAL-${Date.now()}`
  };

  const editIndexValue = document.getElementById("editIndex").value;
  if (editIndexValue !== "") {
    salesData[Number(editIndexValue)] = { ...salesData[Number(editIndexValue)], ...sale };
    showFormMessage("Sale updated successfully.", true);
  } else {
    salesData.push(sale);
    showFormMessage("New sale added successfully.", true);
  }

  form.reset();
  document.getElementById("editIndex").value = "";
  document.getElementById("saveSaleButton").textContent = "Add sale";
  document.getElementById("cancelEditButton").hidden = true;

  setupNewFilterOptions();
  applyFilters();
  renderSalesRecords();
}

function setupNewFilterOptions() {
  const categoryFilter = document.getElementById("categoryFilter");
  const branchFilter = document.getElementById("branchFilter");
  const currentCategory = categoryFilter.value;
  const currentBranch = branchFilter.value;

  const knownCategories = new Set([...categoryFilter.options].map(option => option.value));
  const knownBranches = new Set([...branchFilter.options].map(option => option.value));

  salesData.forEach(record => {
    const category = getField(record, ["Category"]);
    const branch = getField(record, ["Branch"]);
    if (category && !knownCategories.has(category)) {
      addOption(categoryFilter, category);
      knownCategories.add(category);
    }
    if (branch && !knownBranches.has(branch)) {
      addOption(branchFilter, branch);
      knownBranches.add(branch);
    }
  });

  categoryFilter.value = currentCategory;
  branchFilter.value = currentBranch;
}

function renderSalesRecords() {
  const tbody = document.getElementById("recordsBody");
  if (!tbody) return;

  tbody.replaceChildren();
  const recordsToShow = salesData.slice(-50).reverse();
  document.getElementById("recordCount").textContent =
    `${salesData.length} total records (showing latest ${recordsToShow.length})`;

  if (recordsToShow.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty-row";
    cell.textContent = "No sales records available.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  recordsToShow.forEach(record => {
    const originalIndex = salesData.indexOf(record);
    const row = document.createElement("tr");
    const values = [
      getField(record, ["Date"]),
      getField(record, ["Branch"]),
      getField(record, ["Category"]),
      currencyFormatter.format(getNumber(record, ["Sales", "Total"])),
      currencyFormatter.format(getNumber(record, ["Profit"])),
      getField(record, ["Payment", "Payment Method", "Payment_method"])
    ];

    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value || "—";
      row.appendChild(cell);
    });

    const actionCell = document.createElement("td");
    const actionGroup = document.createElement("div");
    actionGroup.className = "action-group";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "action-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => startSaleEdit(originalIndex));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "action-button delete";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteSaleRecord(originalIndex));

    actionGroup.append(editButton, deleteButton);
    actionCell.appendChild(actionGroup);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
}

function startSaleEdit(index) {
  const sale = salesData[index];
  if (!sale) return;

  document.getElementById("editIndex").value = String(index);
  document.getElementById("saleDate").value = getField(sale, ["Date"]);
  document.getElementById("saleBranch").value = getField(sale, ["Branch"]);
  document.getElementById("saleCategory").value = getField(sale, ["Category"]);
  document.getElementById("saleAmount").value = getNumber(sale, ["Sales", "Total"]);
  document.getElementById("saleProfit").value = getNumber(sale, ["Profit"]);
  document.getElementById("salePayment").value = getField(sale, ["Payment", "Payment Method", "Payment_method"]);
  document.getElementById("saleCustomer").value = getField(sale, ["Customer", "Customer Name"]);
  document.getElementById("saleProduct").value = getField(sale, ["Product", "Product line"]);
  document.getElementById("saveSaleButton").textContent = "Save changes";
  document.getElementById("cancelEditButton").hidden = false;
  showFormMessage("Editing selected record. Update the fields and save.", true);
  document.getElementById("saleForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelSaleEdit() {
  document.getElementById("saleForm").reset();
  document.getElementById("editIndex").value = "";
  document.getElementById("saveSaleButton").textContent = "Add sale";
  document.getElementById("cancelEditButton").hidden = true;
  showFormMessage("Edit cancelled.", true);
}

function deleteSaleRecord(index) {
  const confirmed = window.confirm("Delete this sales record from the current session?");
  if (!confirmed) return;

  salesData.splice(index, 1);
  applyFilters();
  renderSalesRecords();
  showFormMessage("Sales record deleted.", true);
}

function showFormMessage(message, success = false) {
  const element = document.getElementById("formMessage");
  element.textContent = message;
  element.classList.toggle("success", success);
}
