/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (STARTER FRAMEWORK)
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
        return JSON.parse(localStorage.getItem(key)) || fallback;
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
   SALES — ADD ENTRY
----------------------------- */
function addSale() {
    const inputs = document.querySelectorAll("#sales .form-grid input");
    const sale = {
        item: inputs[0].value,
        platform: inputs[1].value,
        price: Number(inputs[2].value),
        fees: Number(inputs[3].value),
        shipping: Number(inputs[4].value),
        cogs: Number(inputs[5].value),
        date: inputs[6].value,
        notes: inputs[7].value,
    };

    sale.profit = sale.price - sale.fees - sale.shipping - sale.cogs;

    sales.push(sale);
    Storage.save("sales", sales);

    renderSalesTable();
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
            <td>${s.platform}</td>
            <td>$${s.price.toFixed(2)}</td>
            <td style="color:${s.profit >= 0 ? '#4CAF50' : '#D9534F'};">
                $${s.profit.toFixed(2)}
            </td>
            <td>${s.date}</td>
            <td><button class="delete-btn" onclick="deleteSale(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });

    updateSummary();
}

/* -----------------------------
   SALES — DELETE ENTRY
----------------------------- */
function deleteSale(index) {
    sales.splice(index, 1);
    Storage.save("sales", sales);
    renderSalesTable();
}

/* -----------------------------
   PURCHASES — ADD ENTRY
----------------------------- */
function addPurchase() {
    const inputs = document.querySelectorAll("#purchases .form-grid input");
    const purchase = {
        item: inputs[0].value,
        amount: Number(inputs[1].value),
        date: inputs[2].value,
        notes: inputs[3].value,
    };

    purchases.push(purchase);
    Storage.save("purchases", purchases);

    renderPurchaseTable();
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
            <td>${p.date}</td>
            <td><button class="delete-btn" onclick="deletePurchase(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });

    updateSummary();
}

/* -----------------------------
   PURCHASES — DELETE ENTRY
----------------------------- */
function deletePurchase(index) {
    purchases.splice(index, 1);
    Storage.save("purchases", purchases);
    renderPurchaseTable();
}

/* -----------------------------
   SALARY — UPDATE GOAL
----------------------------- */
function updateSalaryGoal() {
    const input = document.querySelector("#salary input[type='number']");
    salaryGoal = Number(input.value);
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const inputs = document.querySelectorAll("#salary .form-grid input");
    const entry = {
        amount: Number(inputs[0].value),
        date: inputs[1].value,
    };

    salaryEntries.push(entry);
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

    document.querySelector("#salary p:nth-of-type(1)").innerHTML = `<strong>Paid:</strong> $${paid}`;
    document.querySelector("#salary p:nth-of-type(2)").innerHTML = `<strong>Remaining:</strong> $${remaining}`;

    const fill = document.querySelector(".progress-fill");
    const percent = salaryGoal > 0 ? (paid / salaryGoal) * 100 : 0;
    fill.style.width = `${Math.min(percent, 100)}%`;

    updateSummary();
}

/* -----------------------------
   SUMMARY — CALCULATE TOTALS
----------------------------- */
function updateSummary() {
    const totalSales = sales.reduce((sum, s) => sum + s.price, 0);
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
}

/* -----------------------------
   INITIAL LOAD
----------------------------- */
renderSalesTable();
renderPurchaseTable();
updateSalaryTracker();
updateSummary();
