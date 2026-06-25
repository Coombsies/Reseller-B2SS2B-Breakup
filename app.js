/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (WITH LINKING)
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
   DATA NORMALIZATION (BACKWARD COMPAT)
----------------------------- */
function normalizeData() {
    // Ensure purchases have id and remainingQty
    purchases = purchases.map(p => {
        if (!p.id) {
            p.id = crypto.randomUUID();
        }
        if (typeof p.remainingQty !== "number") {
            // If no remainingQty stored, assume full qty is remaining
            p.remainingQty = typeof p.qty === "number" ? p.qty : 0;
        }
        return p;
    });

    // Ensure sales have id, purchaseId, autoCogs
    sales = sales.map(s => {
        if (!s.id) {
            s.id = crypto.randomUUID();
        }
        if (typeof s.purchaseId === "undefined") {
            s.purchaseId = null;
        }
        if (typeof s.autoCogs === "undefined") {
            // If COGS was manually entered before, treat as manual (false)
            s.autoCogs = false;
        }
        return s;
    });

    Storage.save("purchases", purchases);
    Storage.save("sales", sales);
}

/* -----------------------------
   HELPER — FIND PURCHASE BY ID
----------------------------- */
function findPurchaseById(id) {
    return purchases.find(p => p.id === id) || null;
}

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
        id: crypto.randomUUID(),
        item,
        qty,
        total,
        sellingCost,
        cogs,
        profit,
        date,
        notes,
        purchaseId: null,
        autoCogs: cogs === 0 // if user didn't enter COGS, treat as auto later
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
    s.autoCogs = false; // user manually overrode COGS

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — LINK PURCHASE TO SALE
----------------------------- */
function linkPurchaseToSale(saleIndex, purchaseId) {
    const sale = sales[saleIndex];
    const purchase = findPurchaseById(purchaseId);

    if (!sale || !purchase) return;

    const qty = sale.qty || 0;

    if (purchase.remainingQty < qty) {
        alert("Not enough remaining quantity in that purchase to cover this sale.");
        return;
    }

    // If sale was previously linked, restore old purchase remainingQty first
    if (sale.purchaseId) {
        const oldPurchase = findPurchaseById(sale.purchaseId);
        if (oldPurchase) {
            oldPurchase.remainingQty += qty;
        }
    }

    // Link to new purchase
    sale.purchaseId = purchase.id;
    sale.autoCogs = true;

    // Auto COGS = costPerItem * qty
    sale.cogs = purchase.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    // Deplete inventory
    purchase.remainingQty -= qty;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    renderSalesTable();
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — UNLINK PURCHASE FROM SALE
----------------------------- */
function unlinkPurchaseFromSale(saleIndex) {
    const sale = sales[saleIndex];
    if (!sale || !sale.purchaseId) return;

    const purchase = findPurchaseById(sale.purchaseId);
    const qty = sale.qty || 0;

    if (purchase) {
        purchase.remainingQty += qty;
    }

    sale.purchaseId = null;
    sale.autoCogs = false;
    sale.cogs = 0;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    renderSalesTable();
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — DELETE ENTRY
----------------------------- */
function deleteSale(index) {
    const s = sales[index];

    // If linked to a purchase, restore remainingQty
    if (s && s.purchaseId) {
        const purchase = findPurchaseById(s.purchaseId);
        if (purchase) {
            purchase.remainingQty += (s.qty || 0);
        }
    }

    sales.splice(index, 1);
    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    renderSalesTable();
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — RENDER TABLE
----------------------------- */
function renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    tbody.innerHTML = "";

    // Build purchase options (global pool, remainingQty > 0)
    const purchaseOptions = purchases
        .filter(p => p.remainingQty > 0)
        .map(p => ({
            id: p.id,
            label: `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`
        }));

    sales.forEach((s, index) => {
        const row = document.createElement("tr");

        const linkedPurchase = s.purchaseId ? findPurchaseById(s.purchaseId) : null;
        const linkLabel = linkedPurchase
            ? `${linkedPurchase.item} — ${linkedPurchase.remainingQty} left — $${linkedPurchase.costPerItem.toFixed(2)} ea`
            : "Link purchase";

        const purchaseSelectId = `purchase-select-${index}`;

        row.innerHTML = `
            <td>${s.item}</td>
            <td>${s.qty}</td>
            <td>$${s.total.toFixed(2)}</td>
            <td>$${s.sellingCost.toFixed(2)}</td>

            <td contenteditable="true" 
                onblur="updateCogsInline(${index}, this.innerText.replace('$',''))">
                $${s.cogs.toFixed(2)}
            </td>

            <td>
                <select id="${purchaseSelectId}" onchange="handlePurchaseSelectChange(${index}, this.value)">
                    <option value="">${linkLabel}</option>
                    ${purchaseOptions.map(po => `
                        <option value="${po.id}" ${linkedPurchase && linkedPurchase.id === po.id ? "selected" : ""}>
                            ${po.label}
                        </option>
                    `).join("")}
                </select>
                ${s.purchaseId ? `<button class="delete-btn" style="margin-left:4px;" onclick="unlinkPurchaseFromSale(${index})">Unlink</button>` : ""}
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
   SALES — HANDLE DROPDOWN CHANGE
----------------------------- */
function handlePurchaseSelectChange(saleIndex, purchaseId) {
    if (!purchaseId) {
        // If user selects blank, treat as unlink
        unlinkPurchaseFromSale(saleIndex);
    } else {
        linkPurchaseToSale(saleIndex, purchaseId);
    }
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
                id: crypto.randomUUID(),
                item,
                qty,
                total: totalSale,
                sellingCost,
                cogs,
                profit,
                date: "",
                notes: "",
                purchaseId: null,
                autoCogs: true
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
        id: crypto.randomUUID(),
        item,
        amount,
        qty,
        remainingQty: qty,
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
            <td>${typeof p.remainingQty === "number" ? p.remainingQty : p.qty}</td>
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
    const salesProfit = sales.reduce((sum, s) => sum + s.profit, 0);

    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    document.getElementById("sumTotalSales").textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById("sumTotalCOGS").textContent = `$${totalCOGS.toFixed(2)}`;
    document.getElementById("sumSalesProfit").textContent = `$${salesProfit.toFixed(2)}`;
    document.getElementById("sumTotalPurchases").textContent = `$${totalPurchases.toFixed(2)}`;
    document.getElementById("sumTotalRecurring").textContent = `$${totalRecurring.toFixed(2)}`;
    document.getElementById("sumSalaryPaid").textContent = `$${salaryPaid.toFixed(2)}`;

    const netEl = document.getElementById("sumNetProfit");
    netEl.textContent = `$${netProfit.toFixed(2)}`;
    netEl.style.color = netProfit >= 0 ? "#4CAF50" : "#D9534F";

    document.getElementById("sum75").textContent = `$${(netProfit * 0.75).toFixed(2)}`;
    document.getElementById("sum25").textContent = `$${(netProfit * 0.25).toFixed(2)}`;
}

/* -----------------------------
   FINALIZE MONTH (ARCHIVE)
----------------------------- */
function finalizeMonth() {
    if (!confirm("Are you sure you want to finalize this month? This will reset Sales, Purchases, and Salary data.")) return;

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCOGS = sales.reduce((sum, s) => sum + s.cogs, 0);
    const salesProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    const seventyFive = netProfit * 0.75;
    const twentyFive = netProfit * 0.25;

    archiveMonths.push({
        date: new Date().toLocaleDateString(),
        totals: {
            totalSales,
            totalCOGS,
            salesProfit,
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
normalizeData();
renderSalesTable();
renderPurchaseTable();
renderRecurringTable();
renderSalaryTable();
updateSalaryTracker();
updateSummary();
renderArchive();
