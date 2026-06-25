/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC
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
let recurringExpenses = Storage.load("recurringExpenses");
let salaryEntries = Storage.load("salaryEntries");
let salaryGoal = Storage.load("salaryGoal", 0);
let archiveMonths = Storage.load("archiveMonths");

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
}

/* -----------------------------
   SALES — INLINE COGS UPDATE
----------------------------- */
function updateCogsInline(index, newValue) {
    const s = sales[index];
    const newCogs = Number(newValue);

    if (isNaN(newCogs)) return;

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

            <td contenteditable="true" 
                onblur="updateCogsInline(${index}, this.innerText.replace('$',''))">
                $${s.cogs.toFixed(2)}
            </td>

            <td style="color:${s.profit >= 0 ? '#4CAF50' : '#D9534F'};">
                $${s.profit.toFixed(2)}
            </td>

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
            <td>${p.notes || ""}</td>
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
   RECURRING — ADD ENTRY
----------------------------- */
function addRecurring() {
    const name = document.getElementById("rec-name").value.trim();
    const amount = Number(document.getElementById("rec-amount").value) || 0;
    const dueDay = Number(document.getElementById("rec-due").value) || 0;
    const notes = document.getElementById("rec-notes").value.trim();

    if (!name || amount <= 0 || dueDay < 1 || dueDay > 31) {
        alert("Please enter Name, Amount, and a valid Due Day (1–31).");
        return;
    }

    recurringExpenses.push({
        name,
        amount,
        dueDay,
        notes
    });

    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();

    document.getElementById("rec-name").value = "";
    document.getElementById("rec-amount").value = "";
    document.getElementById("rec-due").value = "";
    document.getElementById("rec-notes").value = "";
}

/* -----------------------------
   RECURRING — DELETE ENTRY
----------------------------- */
function deleteRecurring(index) {
    recurringExpenses.splice(index, 1);
    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();
}

/* -----------------------------
   RECURRING — RENDER TABLE
----------------------------- */
function renderRecurringTable() {
    const tbody = document.getElementById("recurring-table-body");
    tbody.innerHTML = "";

    recurringExpenses.forEach((r, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${r.name}</td>
            <td>$${r.amount.toFixed(2)}</td>
            <td>${r.dueDay}</td>
            <td>${r.notes || ""}</td>
            <td><button class="delete-btn" onclick="deleteRecurring(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SALARY — UPDATE GOAL
----------------------------- */
function updateSalaryGoal() {
    const input = document.getElementById("salary-goal-input");
    const val = Number(input.value) || 0;
    salaryGoal = val;
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const amount = Number(document.getElementById("salary-amount").value) || 0;
    const date = document.getElementById("salary-date").value.trim();

    if (amount <= 0) {
        alert("Enter a valid salary amount.");
        return;
    }

    salaryEntries.push({ amount, date });
    Storage.save("salaryEntries", salaryEntries);

    renderSalaryTable();
    updateSalaryTracker();

    document.getElementById("salary-amount").value = "";
    document.getElementById("salary-date").value = "";
}

/* -----------------------------
   SALARY — DELETE ENTRY
----------------------------- */
function deleteSalaryEntry(index) {
    salaryEntries.splice(index, 1);
    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — PAY FULL REMAINING
----------------------------- */
function payFullSalary() {
    const paid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const remaining = salaryGoal - paid;

    if (remaining <= 0) return;

    salaryEntries.push({
        amount: remaining,
        date: new Date().toISOString().split("T")[0]
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — RENDER TABLE
----------------------------- */
function renderSalaryTable() {
    const tbody = document.getElementById("salary-table-body");
    tbody.innerHTML = "";

    salaryEntries.forEach((e, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${e.date || ""}</td>
            <td>$${e.amount.toFixed(2)}</td>
            <td>
                <button class="delete-btn" onclick="deleteSalaryEntry(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
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
    const totalProfitSales = sales.reduce((sum, s) => sum + s.profit, 0);

    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);

    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);

    const netProfit = totalProfitSales - totalPurchases - totalRecurring - salaryPaid;

    const sumTotalSalesEl = document.getElementById("sumTotalSales");
    const sumTotalCOGSEl = document.getElementById("sumTotalCOGS");
    const sumTotalProfitSalesEl = document.getElementById("sumTotalProfitSales");
    const sumTotalPurchasesEl = document.getElementById("sumTotalPurchases");
    const sumTotalRecurringEl = document.getElementById("sumTotalRecurring");
    const sumSalaryPaidEl = document.getElementById("sumSalaryPaid");
    const sumNetProfitEl = document.getElementById("sumNetProfit");
    const sum75El = document.getElementById("sum75");
    const sum25El = document.getElementById("sum25");

    if (sumTotalSalesEl) sumTotalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    if (sumTotalCOGSEl) sumTotalCOGSEl.textContent = `$${totalCOGS.toFixed(2)}`;
    if (sumTotalProfitSalesEl) sumTotalProfitSalesEl.textContent = `$${totalProfitSales.toFixed(2)}`;
    if (sumTotalPurchasesEl) sumTotalPurchasesEl.textContent = `$${totalPurchases.toFixed(2)}`;
    if (sumTotalRecurringEl) sumTotalRecurringEl.textContent = `$${totalRecurring.toFixed(2)}`;
    if (sumSalaryPaidEl) sumSalaryPaidEl.textContent = `$${salaryPaid.toFixed(2)}`;

    if (sumNetProfitEl) {
        sumNetProfitEl.textContent = `$${netProfit.toFixed(2)}`;
        sumNetProfitEl.style.color = netProfit >= 0 ? "#4CAF50" : "#D9534F";
    }

    const seventyFive = netProfit * 0.75;
    const twentyFive = netProfit * 0.25;

    if (sum75El) sum75El.textContent = `$${seventyFive.toFixed(2)}`;
    if (sum25El) sum25El.textContent = `$${twentyFive.toFixed(2)}`;
}

/* -----------------------------
   FINALIZE MONTH (ARCHIVE)
----------------------------- */
function finalizeMonth() {
    if (!confirm("Are you sure you want to finalize this month? This will reset Sales, Purchases, and Salary data.")) return;

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCOGS = sales.reduce((sum, s) => sum + s.cogs, 0);
    const totalProfitSales = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalProfitSales - totalPurchases - totalRecurring - salaryPaid;

    const seventyFive = netProfit * 0.75;
    const twentyFive = netProfit * 0.25;

    archiveMonths.push({
        date: new Date().toLocaleDateString(),
        totals: {
            totalSales,
            totalCOGS,
            totalProfitSales,
            totalPurchases,
            totalRecurring,
            salaryPaid,
            netProfit,
            seventyFive,
            twentyFive
        }
    });

    Storage.save("archiveMonths", archiveMonths);

    // Reset monthly data but keep recurring expenses
    sales = [];
    purchases = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    renderSalaryTable();
    updateSalaryTracker();
    updateSummary();
    renderArchive();

    alert("Month finalized and archived.");
}

/* -----------------------------
   ARCHIVE — RENDER
----------------------------- */
function renderArchive() {
    const container = document.getElementById("archive-list");
    if (!container) return;

    if (!archiveMonths || archiveMonths.length === 0) {
        container.innerHTML = "<p>No months archived yet.</p>";
        return;
    }

    container.innerHTML = archiveMonths.map(m => `
        <div class="archive-month">
            <h4>${m.date}</h4>
            <p><strong>Sales:</strong> $${m.totals.totalSales.toFixed(2)}</p>
            <p><strong>Net Profit:</strong> $${m.totals.netProfit.toFixed(2)}</p>
            <p><strong>75% Sourcing:</strong> $${m.totals.seventyFive.toFixed(2)}</p>
            <p><strong>25% Savings:</strong> $${m.totals.twentyFive.toFixed(2)}</p>
        </div>
    `).join("");
}

/* -----------------------------
   RESET MONTH (manual)
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
    renderRecurringTable();
    renderSalaryTable();
    updateSalaryTracker();
    updateSummary();
}

/* -----------------------------
   INITIAL LOAD
----------------------------- */
renderSalesTable();
renderPurchaseTable();
renderRecurringTable();
renderSalaryTable();
updateSalaryTracker();
updateSummary();
renderArchive();

/* -----------------------------
   WIRE FINALIZE BUTTON
----------------------------- */
const finalizeBtn = document.getElementById("finalizeMonthBtn");
if (finalizeBtn) {
    finalizeBtn.addEventListener("click", finalizeMonth);
}
