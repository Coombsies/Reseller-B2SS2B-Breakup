/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (CLEANED + FIXED)
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
let parentPurchases = Storage.load("parentPurchases", []);

/* -----------------------------
   DATA NORMALIZATION
----------------------------- */
function normalizeData() {
    purchases = purchases.map(p => {
        if (!p.id) p.id = crypto.randomUUID();
        if (typeof p.remainingQty !== "number") {
            p.remainingQty = typeof p.qty === "number" ? p.qty : 0;
        }
        return p;
    });

    sales = sales.map(s => {
        if (!s.id) s.id = crypto.randomUUID();
        if (typeof s.purchaseId === "undefined") s.purchaseId = null;
        if (typeof s.autoCogs === "undefined") s.autoCogs = false;
        return s;
    });

    parentPurchases = parentPurchases.map(p => {
        if (!p.id) p.id = crypto.randomUUID();
        if (!Array.isArray(p.subPurchases)) p.subPurchases = [];
        if (typeof p.buyerPremiumPercent !== "number") p.buyerPremiumPercent = 0;
        if (typeof p.buyerPremiumAmount !== "number") p.buyerPremiumAmount = 0;
        if (typeof p.totalHammer !== "number") p.totalHammer = 0;
        if (typeof p.totalPremium !== "number") p.totalPremium = 0;
        if (typeof p.totalCost !== "number") p.totalCost = 0;
        if (typeof p.totalQty !== "number") p.totalQty = 0;
        if (typeof p.costPerItem !== "number") p.costPerItem = 0;

        p.subPurchases = p.subPurchases.map(l => {
            if (!l.id) l.id = crypto.randomUUID();
            if (!l.parentId) l.parentId = p.id;
            if (typeof l.hammerPrice !== "number") l.hammerPrice = 0;
            if (typeof l.qty !== "number") l.qty = 0;
            if (typeof l.premiumShare !== "number") l.premiumShare = 0;
            if (typeof l.totalCost !== "number") l.totalCost = l.hammerPrice + l.premiumShare;
            if (typeof l.costPerItem !== "number") {
                l.costPerItem = l.qty > 0 ? l.totalCost / l.qty : 0;
            }
            if (typeof l.remainingQty !== "number") l.remainingQty = l.qty;
            return l;
        });

        return p;
    });

    Storage.save("purchases", purchases);
    Storage.save("sales", sales);
    Storage.save("parentPurchases", parentPurchases);
}

/* -----------------------------
   HELPERS
----------------------------- */
function findPurchaseById(id) {
    return purchases.find(p => p.id === id) || null;
}

function findLotById(lotId) {
    for (const parent of parentPurchases) {
        const lot = parent.subPurchases.find(l => l.id === lotId);
        if (lot) return { parent, lot };
    }
    return null;
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
        alert("Please enter Item, Qty, and Total Sale Price.");
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
        lotId: null,
        autoCogs: cogs === 0
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
    s.autoCogs = false;

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — LINK SIMPLE PURCHASE
----------------------------- */
function linkPurchaseToSale(saleIndex, purchaseId) {
    const sale = sales[saleIndex];
    const purchase = findPurchaseById(purchaseId);

    if (!sale || !purchase) return;

    const qty = sale.qty || 0;

    if (purchase.remainingQty < qty) {
        alert("Not enough remaining quantity in that purchase.");
        return;
    }

    if (sale.purchaseId) {
        const old = findPurchaseById(sale.purchaseId);
        if (old) old.remainingQty += qty;
    }

    if (sale.lotId) {
        const found = findLotById(sale.lotId);
        if (found) found.lot.remainingQty += qty;
    }

    sale.purchaseId = purchase.id;
    sale.lotId = null;
    sale.autoCogs = true;

    sale.cogs = purchase.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    purchase.remainingQty -= qty;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}

/* -----------------------------
   SALES — LINK LOT TO SALE
----------------------------- */
function linkLotToSale(saleIndex, lotId) {
    const sale = sales[saleIndex];
    const found = findLotById(lotId);

    if (!sale || !found) return;

    const { parent, lot } = found;
    const qty = sale.qty || 0;

    if (lot.remainingQty < qty) {
        alert("Not enough remaining quantity in that lot.");
        return;
    }

    if (sale.purchaseId) {
        const old = findPurchaseById(sale.purchaseId);
        if (old) old.remainingQty += qty;
    }

    if (sale.lotId) {
        const oldLot = findLotById(sale.lotId);
        if (oldLot) oldLot.lot.remainingQty += qty;
    }

    sale.purchaseId = null;
    sale.lotId = lot.id;
    sale.autoCogs = true;

    sale.cogs = lot.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    lot.remainingQty -= qty;

    Storage.save("sales", sales);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("purchases", purchases);

    renderSalesTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — UNLINK
----------------------------- */
function unlinkPurchaseFromSale(saleIndex) {
    const sale = sales[saleIndex];
    if (!sale) return;

    const qty = sale.qty || 0;

    if (sale.purchaseId) {
        const p = findPurchaseById(sale.purchaseId);
        if (p) p.remainingQty += qty;
    }

    if (sale.lotId) {
        const found = findLotById(sale.lotId);
        if (found) found.lot.remainingQty += qty;
    }

    sale.purchaseId = null;
    sale.lotId = null;
    sale.autoCogs = false;
    sale.cogs = 0;
    sale.profit = sale.total - sale.sellingCost;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}
/* -----------------------------
   SALES — DELETE
----------------------------- */
function deleteSale(index) {
    const s = sales[index];
    const qty = s ? s.qty : 0;

    if (s.purchaseId) {
        const p = findPurchaseById(s.purchaseId);
        if (p) p.remainingQty += qty;
    }

    if (s.lotId) {
        const found = findLotById(s.lotId);
        if (found) found.lot.remainingQty += qty;
    }

    sales.splice(index, 1);

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}

/* -----------------------------
   SALES — RENDER TABLE
----------------------------- */
function renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    tbody.innerHTML = "";

    const simpleOptions = purchases
        .filter(p => p.remainingQty > 0)
        .map(p => ({
            type: "simple",
            id: p.id,
            label: `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`
        }));

    const lotOptions = [];
    parentPurchases.forEach(parent => {
        parent.subPurchases.forEach(lot => {
            if (lot.remainingQty > 0) {
                lotOptions.push({
                    type: "lot",
                    id: lot.id,
                    parentName: parent.sourceName,
                    label: `Lot ${lot.lotNumber} — ${lot.remainingQty} left — $${lot.costPerItem.toFixed(2)} ea`
                });
            }
        });
    });

    sales.forEach((s, index) => {
        const row = document.createElement("tr");

        let linkLabel = "Link purchase";
        if (s.purchaseId) {
            const p = findPurchaseById(s.purchaseId);
            if (p) linkLabel = `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`;
        }
        if (s.lotId) {
            const found = findLotById(s.lotId);
            if (found) {
                linkLabel = `${found.parent.sourceName} — Lot ${found.lot.lotNumber} — ${found.lot.remainingQty} left — $${found.lot.costPerItem.toFixed(2)} ea`;
            }
        }

        const selectId = `purchase-select-${index}`;

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
                <select id="${selectId}" onchange="handlePurchaseSelectChange(${index}, this.value)">
                    <option value="">${linkLabel}</option>

                    <optgroup label="Parent Purchases (Lots)">
                        ${lotOptions.map(o => `
                            <option value="lot-${o.id}">
                                ${o.parentName} — ${o.label}
                            </option>
                        `).join("")}
                    </optgroup>

                    <optgroup label="Simple Purchases">
                        ${simpleOptions.map(o => `
                            <option value="simple-${o.id}">
                                ${o.label}
                            </option>
                        `).join("")}
                    </optgroup>
                </select>

                ${(s.purchaseId || s.lotId)
                    ? `<button class="delete-btn" onclick="unlinkPurchaseFromSale(${index})">Unlink</button>`
                    : ""}
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
   HANDLE DROPDOWN CHANGE
----------------------------- */
function handlePurchaseSelectChange(saleIndex, value) {
    if (!value) {
        unlinkPurchaseFromSale(saleIndex);
        return;
    }

    if (value.startsWith("simple-")) {
        linkPurchaseToSale(saleIndex, value.replace("simple-", ""));
        return;
    }

    if (value.startsWith("lot-")) {
        linkLotToSale(saleIndex, value.replace("lot-", ""));
        return;
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
                lotId: null,
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
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const amount = Number(document.getElementById("salary-amount").value) || 0;
    const date = document.getElementById("salary-date").value.trim();

    if (amount <= 0 || !date) {
        alert("Enter Amount and Date.");
        return;
    }

    salaryEntries.push({
        id: crypto.randomUUID(),
        amount,
        date,
        notes: ""
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSummary();
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
    updateSummary();
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — RENDER TABLE
----------------------------- */
function renderSalaryTable() {
    const tbody = document.getElementById("salary-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    salaryEntries.forEach((e, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${e.date}</td>
            <td>$${e.amount.toFixed(2)}</td>
            <td><button class="delete-btn" onclick="deleteSalaryEntry(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SALARY GOAL (HTML MATCHED)
----------------------------- */
function updateSalaryGoal() {
    const goal = Number(document.getElementById("salary-goal-input").value) || 0;
    salaryGoal = goal;
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

function loadSalaryGoal() {
    const el = document.getElementById("salary-goal-input");
    if (el) el.value = salaryGoal || 0;
}

/* -----------------------------
   SALARY TRACKER (NEW)
----------------------------- */
function updateSalaryTracker() {
    const paid = salaryEntries.reduce((s, e) => s + e.amount, 0);
    const remaining = Math.max(0, salaryGoal - paid);

    // Update Paid/Remaining text (HTML has no IDs)
    const paidText = document.querySelector("#salary .card:nth-of-type(2) p:nth-of-type(1)");
    const remainingText = document.querySelector("#salary .card:nth-of-type(2) p:nth-of-type(2)");

    if (paidText) paidText.innerHTML = `<strong>Paid:</strong> $${paid.toFixed(2)}`;
    if (remainingText) remainingText.innerHTML = `<strong>Remaining:</strong> $${remaining.toFixed(2)}`;

    // Update progress bar
    const bar = document.querySelector(".progress-fill");
    if (bar) {
        const pct = salaryGoal > 0 ? Math.min(100, (paid / salaryGoal) * 100) : 0;
        bar.style.width = pct + "%";
    }
}

/* -----------------------------
   PAY FULL SALARY (NEW)
----------------------------- */
function payFullSalary() {
    if (salaryGoal <= 0) {
        alert("Set a salary goal first.");
        return;
    }

    const paid = salaryEntries.reduce((s, e) => s + e.amount, 0);
    const remaining = salaryGoal - paid;

    if (remaining <= 0) {
        alert("Goal already met.");
        return;
    }

    salaryEntries.push({
        id: crypto.randomUUID(),
        amount: remaining,
        date: new Date().toISOString().split("T")[0],
        notes: "Full goal auto-payment"
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSummary();
    updateSalaryTracker();
}
/* -----------------------------
   SIMPLE PURCHASES
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
            <td>${p.remainingQty}</td>
            <td>${p.date}</td>
            <td>${p.notes || ""}</td>
            <td><button class="delete-btn" onclick="deletePurchase(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

function deletePurchase(index) {
    purchases.splice(index, 1);
    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   PARENT PURCHASE — FIXED
----------------------------- */
function addParentPurchase() {
    const sourceName = document.getElementById("pp-source").value.trim();
    const date = document.getElementById("pp-date").value;
    const premiumPercent = Number(document.getElementById("pp-premium-percent").value) || 0;
    const premiumAmount = Number(document.getElementById("pp-premium-amount").value) || 0;

    if (!sourceName || !date) {
        alert("Enter Source Name and Date.");
        return;
    }

    const parent = {
        id: crypto.randomUUID(),
        sourceName,
        date,
        buyerPremiumPercent: premiumPercent,
        buyerPremiumAmount: premiumAmount,
        totalHammer: 0,
        totalPremium: premiumAmount,
        totalCost: premiumAmount,
        totalQty: 0,
        costPerItem: 0,
        subPurchases: []
    };

    parentPurchases.push(parent);
    Storage.save("parentPurchases", parentPurchases);

    renderParentPurchaseTable();

    document.getElementById("pp-source").value = "";
    document.getElementById("pp-date").value = "";
    document.getElementById("pp-premium-percent").value = "";
    document.getElementById("pp-premium-amount").value = "";
}

/* -----------------------------
   SELECT PARENT PURCHASE
----------------------------- */
let activeParentIndex = null;

function selectParentPurchase(index) {
    activeParentIndex = index;
    const parent = parentPurchases[index];

    document.getElementById("lot-parent-name").textContent = parent.sourceName;
    document.getElementById("lot-section").style.display = "block";

    renderLotTable();
}

/* -----------------------------
   LOTS — ADD LOT (FIXED)
----------------------------- */
function addLot() {
    if (activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];

    const lotNumber = document.getElementById("lot-number").value.trim();
    const hammerPrice = Number(document.getElementById("lot-hammer").value) || 0;
    const qty = Number(document.getElementById("lot-qty").value) || 0;

    if (!lotNumber || hammerPrice <= 0 || qty <= 0) {
        alert("Enter Lot Number, Hammer Price, and Qty.");
        return;
    }

    const lot = {
        id: crypto.randomUUID(),
        parentId: parent.id,
        lotNumber,
        hammerPrice,
        qty,
        premiumShare: 0,
        totalCost: 0,
        costPerItem: 0,
        remainingQty: qty
    };

    parent.subPurchases.push(lot);

    recalcParentTotals(parent);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();
    renderLotTable();

    document.getElementById("lot-number").value = "";
    document.getElementById("lot-hammer").value = "";
    document.getElementById("lot-qty").value = "";
}

/* -----------------------------
   RECALC PARENT TOTALS — FIXED
----------------------------- */
function recalcParentTotals(parent) {
    parent.totalHammer = parent.subPurchases.reduce((sum, l) => sum + l.hammerPrice, 0);

    if (parent.buyerPremiumPercent > 0) {
        parent.totalPremium = parent.totalHammer * (parent.buyerPremiumPercent / 100);
        parent.buyerPremiumAmount = parent.totalPremium;
    } else if (parent.buyerPremiumAmount > 0) {
        parent.totalPremium = parent.buyerPremiumAmount;
        parent.buyerPremiumPercent =
            parent.totalHammer > 0
                ? (parent.buyerPremiumAmount / parent.totalHammer) * 100
                : 0;
    } else {
        parent.totalPremium = 0;
    }

    parent.subPurchases.forEach(lot => {
        if (parent.totalHammer > 0) {
            lot.premiumShare = (lot.hammerPrice / parent.totalHammer) * parent.totalPremium;
        } else {
            lot.premiumShare = 0;
        }

        lot.totalCost = lot.hammerPrice + lot.premiumShare;
        lot.costPerItem = lot.qty > 0 ? lot.totalCost / lot.qty : 0;
    });

    parent.totalQty = parent.subPurchases.reduce((sum, l) => sum + l.qty, 0);
    parent.totalCost = parent.totalHammer + parent.totalPremium;
    parent.costPerItem = parent.totalQty > 0 ? parent.totalCost / parent.totalQty : 0;
}

/* -----------------------------
   LOT TABLE
----------------------------- */
function renderLotTable() {
    const tbody = document.getElementById("lot-table-body");
    if (!tbody || activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];
    tbody.innerHTML = "";

    parent.subPurchases.forEach((lot, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${lot.lotNumber}</td>
            <td>$${lot.hammerPrice.toFixed(2)}</td>
            <td>${lot.qty}</td>
            <td>$${lot.premiumShare.toFixed(2)}</td>
            <td>$${lot.totalCost.toFixed(2)}</td>
            <td>$${lot.costPerItem.toFixed(2)}</td>
            <td>${lot.remainingQty}</td>
            <td><button class="delete-btn" onclick="deleteLot(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

function deleteLot(index) {
    if (activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];
    parent.subPurchases.splice(index, 1);

    recalcParentTotals(parent);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();
    renderLotTable();
}

/* -----------------------------
   DELETE PARENT PURCHASE
----------------------------- */
function deleteParentPurchase(index) {
    parentPurchases.splice(index, 1);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();

    document.getElementById("lot-section").style.display = "none";
}

/* -----------------------------
   RENDER PARENT PURCHASE TABLE
----------------------------- */
function renderParentPurchaseTable() {
    const tbody = document.getElementById("parent-purchase-table-body");
    tbody.innerHTML = "";

    parentPurchases.forEach((p, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${p.sourceName}</td>
            <td>${p.date}</td>
            <td>$${p.totalHammer.toFixed(2)}</td>
            <td>$${p.totalPremium.toFixed(2)}</td>
            <td>$${p.totalCost.toFixed(2)}</td>
            <td>${p.totalQty}</td>
            <td>
                <button class="action-btn" onclick="selectParentPurchase(${index})">
                    View Lots
                </button>
            </td>
            <td>
                <button class="delete-btn" onclick="deleteParentPurchase(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SUMMARY CALCULATIONS
----------------------------- */
function updateSummary() {
    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalCogs = sales.reduce((s, x) => s + x.cogs, 0);
    const salesProfit = totalSales - totalCogs;

    const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0)
        + parentPurchases.reduce((s, p) => s + p.totalCost, 0);

    const totalRecurring = recurringExpenses.reduce((s, r) => s + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((s, e) => s + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    document.getElementById("sumTotalSales").textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById("sumTotalCOGS").textContent = `$${totalCogs.toFixed(2)}`;
    document.getElementById("sumSalesProfit").textContent = `$${salesProfit.toFixed(2)}`;
    document.getElementById("sumTotalPurchases").textContent = `$${totalPurchases.toFixed(2)}`;
    document.getElementById("sumTotalRecurring").textContent = `$${totalRecurring.toFixed(2)}`;
    document.getElementById("sumSalaryPaid").textContent = `$${salaryPaid.toFixed(2)}`;
    document.getElementById("sumNetProfit").textContent = `$${netProfit.toFixed(2)}`;

    document.getElementById("sum75").textContent = `$${(netProfit * 0.75).toFixed(2)}`;
    document.getElementById("sum25").textContent = `$${(netProfit * 0.25).toFixed(2)}`;

    updateSalaryTracker();
}

/* -----------------------------
   FINALIZE MONTH
----------------------------- */
function finalizeMonth() {
    const monthName = prompt("Enter a name for this month (e.g., June 2026):");
    if (!monthName) return;

    const archive = {
        name: monthName,
        sales,
        purchases,
        parentPurchases,
        recurringExpenses,
        salaryEntries,
        summary: {
            totalSales: sales.reduce((s, x) => s + x.total, 0),
            totalCogs: sales.reduce((s, x) => s + x.cogs, 0),
            totalPurchases: purchases.reduce((s, p) => s + p.amount, 0)
                + parentPurchases.reduce((s, p) => s + p.totalCost, 0),
            totalRecurring: recurringExpenses.reduce((s, r) => s + r.amount, 0),
            salaryPaid: salaryEntries.reduce((s, e) => s + e.amount, 0)
        }
    };

    archiveMonths.push(archive);
    Storage.save("archiveMonths", archiveMonths);

    sales = [];
    purchases = [];
    parentPurchases = [];
    recurringExpenses = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("recurringExpenses", recurringExpenses);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderArchive();
    updateSummary();

    alert("Month finalized and archived!");
}

/* -----------------------------
   RENDER ARCHIVE LIST
----------------------------- */
function renderArchive() {
    const container = document.getElementById("archive-list");
    container.innerHTML = "";

    archiveMonths.forEach(a => {
        const div = document.createElement("div");
        div.className = "archive-entry";

        div.innerHTML = `
            <strong>${a.name}</strong><br>
            Total Sales: $${a.summary.totalSales.toFixed(2)}<br>
            Total COGS: $${a.summary.totalCogs.toFixed(2)}<br>
            Total Purchases: $${a.summary.totalPurchases.toFixed(2)}<br>
            Recurring: $${a.summary.totalRecurring.toFixed(2)}<br>
            Salary Paid: $${a.summary.salaryPaid.toFixed(2)}
        `;

        container.appendChild(div);
    });
}

/* -----------------------------
   INITIAL RENDER
----------------------------- */
normalizeData();
renderSalesTable();
renderSalaryTable();
loadSalaryGoal();
updateSalaryTracker();
renderPurchaseTable();
renderParentPurchaseTable();
renderLotTable();
renderArchive();
updateSummary();
