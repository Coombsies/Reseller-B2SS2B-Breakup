/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (FINAL)
   ============================================================ */

/* -----------------------------
   SECTION NAVIGATION
----------------------------- */
const navButtons = document.querySelectorAll(".nav-btn");
const panels = document.querySelectorAll(".panel");

navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        navButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const target = btn.dataset.section;

        panels.forEach(panel => {
            panel.classList.remove("active");
            if (panel.id === target) panel.classList.add("active");
        });
    });
});

/* -----------------------------
   LOCAL STORAGE WRAPPER
----------------------------- */
const Storage = {
    save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },
    load(key, fallback = []) {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    clear(key) {
        localStorage.removeItem(key);
    }
};

/* -----------------------------
   DATA MODELS
----------------------------- */
let sales = Storage.load("sales");
let purchases = Storage.load("purchases");
let salaryEntries = Storage.load("salaryEntries");
let salaryGoal = Storage.load("salaryGoal", 0);

/* -----------------------------
   SALES — ADD MANUAL ENTRY
----------------------------- */
function addSale() {
    const item = document.getElementById("manual-item").value.trim();
    const qty = Number(document.getElementById("manual-qty").value) || 0;
    const total = Number(document.getElementById("manual-total").value) || 0;
    const sellingCost = Number(document.getElementById("manual-cost").value) || 0;
    const cogs = Number(document.getElementById("manual-cogs").value) || 0;
    const date = document.getElementById("manual-date").value.trim();
    const notes = document.getElementById("manual-notes").value.trim();

    if (!item || qty <= 0 || total <= 0) {
        alert("Please enter at least Item, Qty, and Total Sale Price.");
        return;
    }

    const profit = total - sellingCost - cogs;

    sales.push({
        item,
        qty,
        total,
        sellingCost,
        cogs,
        profit,
        date,
        notes
    });

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();

    document.getElementById("manual-item").value = "";
    document.getElementById("manual-qty").value = "";
    document.getElementById("manual-total").value = "";
    document.getElementById("manual-cost").value = "";
    document.getElementById("manual-cogs").value = "";
    document.getElementById("manual-date").value = "";
    document.getElementById("manual-notes").value = "";

    const toast = document.createElement("div");
    toast.textContent = "Sale added!";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.background = "#4CAF50";
    toast.style.color = "white";
    toast.style.padding = "10px 15px";
    toast.style.borderRadius = "6px";
    toast.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
    toast.style.zIndex = "9999";
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
}

/* -----------------------------
   SALES — EDIT COGS
----------------------------- */
function editCogs(index) {
    const s = sales[index];
    const current = s.cogs || 0;
    const input = prompt(`Enter COGS for:\n${s.item}\n(Current: ${current})`, current);

    if (input === null) return;

    const newCogs = Number(input);
    if (isNaN(newCogs)) {
        alert("Invalid COGS value.");
        return;
    }

    s.cogs = newCogs;
    s.profit = s.total - s.sellingCost - s.cogs;

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — DELETE ENTRY
----------------------------- */
function deleteSale(index) {
    sales.splice(index, 1);
    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — RENDER TABLE
----------------------------- */
function renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    tbody.innerHTML = "";

    sales.forEach((s, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${s.item}</td>
            <td>${s.qty}</td>
            <td>$${s.total.toFixed(2)}</td>
            <td>$${s.sellingCost.toFixed(2)}</td>
            <td>$${s.cogs.toFixed(2)}</td>
            <td style="color:${s.profit >= 0 ? '#4CAF50' : '#D9534F'};">
                $${s.profit.toFixed(2)}
            </td>
            <td><button class="action-btn" onclick="editCogs(${index})">Edit COGS</button></td>
            <td><button class="delete-btn" onclick="deleteSale(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   CSV IMPORTER
----------------------------- */
function importCSV(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const rows = lines.map(line => parseCSVLine(line));

        const headerIndex = rows.findIndex(r => r[0] === "Listing title");
        if (headerIndex === -1) {
            alert("CSV format not recognized.");
            return;
        }

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 9) continue;

            const item = (r[0] || "").trim();
            if (!item) continue;

            const qty = toNumber(r[2]);
            const totalSale = toNumber(r[3]);
            const sellingCost = toNumber(r[8]);
            const cogs = 0;
            const profit = totalSale - sellingCost - cogs;

            sales.push({
                item,
                qty,
                total: totalSale,
                sellingCost,
                cogs,
                profit,
                date: "",
                notes: ""
            });
        }

        Storage.save("sales", sales);
        renderSalesTable();
        updateSummary();
        alert("CSV Imported Successfully!");
    };

    reader.readAsText(file);
}

function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function toNumber(str) {
    if (!str) return 0;
    const cleaned = String(str)
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .replace(/\(/g, "-")
        .replace(/\)/g, "")
        .trim();
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
}

/* -----------------------------
   PURCHASES — ADD ENTRY
----------------------------- */
function addPurchase() {
    const item = document.getElementById("purchase-item").value.trim();
    const amount = Number(document.getElementById("purchase-amount").value) || 0;
    const qty = Number(document.getElementById("purchase-qty").value) || 0;
    const date = document.getElementById("purchase-date").value.trim();
    const notes = document.getElementById("purchase-notes").value.trim();

    if (!item || amount <= 0 || qty <= 0) {
        alert("Please enter Item, Amount, and Quantity.");
        return;
    }

    const costPerItem = amount / qty;

    purchases.push({
        item,
        amount,
        qty,
        costPerItem,
        date,
        notes
    });

    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();

    document.getElementById("purchase-item").value = "";
    document.getElementById("purchase-amount").value = "";
    document.getElementById("purchase-qty").value = "";
    document.getElementById("purchase-date").value = "";
    document.getElementById("purchase-notes").value = "";
}

/* -----------------------------
   PURCHASES — RENDER TABLE
----------------------------- */
function renderPurchaseTable() {
    const tbody = document.getElementById("purchase-table-body");
    tbody.innerHTML = "";

    purchases.forEach((p, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${p.item}</td>
            <td>$${p.amount.toFixed(2)}</td>
            <td>${p.qty}</td>
            <td>$${p.costPerItem.toFixed(2)}</td>
            <td>${p.date}</td>
            <td><button class="delete-btn" onclick="deletePurchase(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   PURCHASES — DELETE ENTRY
----------------------------- */
function deletePurchase(index) {
    purchases.splice(index, 1);
    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALARY — UPDATE GOAL
----------------------------- */
function updateSalaryGoal() {
    const input = document.querySelector("#salary input[type='number']");
    salaryGoal = Number(input.value) || 0;
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const inputs = document.querySelectorAll("#salary .form-grid input");
    const amount = Number(inputs[0].value) || 0;
    const date = inputs[1].value.trim();

    if (amount <= 0) {
        alert("Enter a valid salary amount.");
        return;
    }

    salaryEntries.push({ amount, date });
    Storage.save("salaryEntries", salaryEntries);

    updateSalaryTracker();
}

/* -----------------------------
   SALARY — PAY FULL GOAL
----------------------------- */
function payFullSalary() {
    if (salaryGoal <= 0) return;

    salaryEntries.push({
        amount: salaryGoal,
        date: new Date().toISOString().split("T")[0]
    });

    Storage.save("salaryEntries", salaryEntries);
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — TRACKER UI
----------------------------- */
function updateSalaryTracker() {
    const paid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const remaining = Math.max(salaryGoal - paid, 0);

    document.querySelector("#salary p:nth-of-type(1)").innerHTML =
        `<strong>Paid:</strong> $${paid.toFixed(2)}`;
    document.querySelector("#salary p:nth-of-type(2)").innerHTML =
        `<strong>Remaining:</strong> $${remaining.toFixed(2)}`;

    const fill = document.querySelector(".progress-fill");
    const percent = salaryGoal > 0 ? (paid / salaryGoal) * 100 : 0;
    fill.style.width = `${Math.min(percent, 100)}%`;

    updateSummary();
}

/* -----------------------------
   SUMMARY — CALCULATE TOTALS
----------------------------- */
function updateSummary() {
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCOGS = sales.reduce((sum, s) => sum + s.cogs, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);

    const cards = document.querySelectorAll(".summary-card p");

    cards[0].innerText = `$${totalSales.toFixed(2)}`;
    cards[1].innerText = `$${totalCOGS.toFixed(2)}`;
    cards[2].innerText = `$${totalProfit.toFixed(2)}`;
    cards[3].innerText = `$${salaryPaid.toFixed(2)}`;
}

/* -----------------------------
   RESET MONTH
----------------------------- */
function resetMonth() {
    if (!confirm("Reset all monthly data?")) return;

    sales = [];
    purchases = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    updateSalaryTracker();
    updateSummary();
}

/* -----------------------------
   INITIAL LOAD
----------------------------- */
renderSalesTable();
renderPurchaseTable();
updateSalaryTracker();
updateSummary();
