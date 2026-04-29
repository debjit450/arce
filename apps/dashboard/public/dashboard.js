function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function el(tag, className, children) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (typeof children === "string") {
    element.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach(function (child) {
      element.appendChild(child);
    });
  } else if (children instanceof Node) {
    element.appendChild(children);
  }

  return element;
}

function renderTotals(data) {
  document.getElementById("requests-total").textContent = formatNumber(
    data.totals.requests
  );
  document.getElementById("allowed-total").textContent = formatNumber(
    data.totals.allowed
  );
  document.getElementById("rate-limited-total").textContent = formatNumber(
    data.totals.rateLimited
  );
  document.getElementById("blocked-total").textContent = formatNumber(
    data.totals.blocked
  );
  document.getElementById("anomalies-total").textContent = formatNumber(
    data.totals.anomalies
  );
  document.getElementById("last-updated").textContent =
    "Updated " + new Date().toLocaleTimeString();
}

function renderChart(series) {
  var container = document.getElementById("traffic-chart");
  var maxRequests = Math.max.apply(
    null,
    series
      .map(function (point) {
        return point.requests;
      })
      .concat([1])
  );

  container.innerHTML = "";

  series.forEach(function (point) {
    var requestHeight = Math.max(
      4,
      Math.round((point.requests / maxRequests) * 170)
    );
    var blockedHeight =
      point.blocked > 0
        ? Math.max(3, Math.round((point.blocked / maxRequests) * 36))
        : 0;

    var barBlocked = el("div", "bar-blocked");
    barBlocked.style.height = blockedHeight + "px";

    var barFill = el("div", "bar-fill");
    barFill.style.height = requestHeight + "px";

    var barLabel = el("div", "bar-label", formatTime(point.timestamp));

    var bar = el("div", "bar", [barBlocked, barFill, barLabel]);
    bar.title =
      formatTime(point.timestamp) +
      " | requests=" +
      point.requests +
      ", blocked=" +
      point.blocked +
      ", anomalies=" +
      point.anomalies;

    container.appendChild(bar);
  });
}

function renderBlocks(blocks) {
  var container = document.getElementById("active-blocks");
  container.innerHTML = "";

  if (!blocks.length) {
    container.appendChild(el("div", "empty", "No active blocks right now."));
    return;
  }

  blocks.forEach(function (block) {
    var subjectEl = el("strong", null, block.subject);
    var reasonEl = el("p", null, block.reason);
    var ttlBadge = el(
      "span",
      "badge",
      "TTL " + (block.ttlMs / 1000).toFixed(0) + "s"
    );
    var expiresBadge = el(
      "span",
      "badge",
      "Expires " + formatTime(block.expiresAt)
    );
    var badgeRow = el("div", "badge-row", [ttlBadge, expiresBadge]);
    var article = el("article", "list-item", [subjectEl, reasonEl, badgeRow]);

    container.appendChild(article);
  });
}

function renderAnomalies(events) {
  var container = document.getElementById("recent-anomalies");
  container.innerHTML = "";

  if (!events.length) {
    container.appendChild(el("div", "empty", "No flagged anomalies yet."));
    return;
  }

  events.forEach(function (event) {
    var subjectEl = el("strong", null, event.subject);
    var reasonEl = el("p", null, event.reasons.join(" "));
    var tierBadge = el("span", "badge", "Tier " + event.tier);
    var riskBadge = el("span", "badge", "Risk " + event.riskScore);
    var timeBadge = el("span", "badge", formatTime(event.timestamp));

    var badges = [tierBadge, riskBadge, timeBadge];

    event.anomalies.forEach(function (anomaly) {
      badges.push(el("span", "badge", anomaly.code));
    });

    var badgeRow = el("div", "badge-row", badges);
    var article = el("article", "list-item", [subjectEl, reasonEl, badgeRow]);

    container.appendChild(article);
  });
}

async function refresh() {
  try {
    var response = await fetch("/api/dashboard-data");

    if (!response.ok) {
      document.getElementById("last-updated").textContent =
        "Error: " + response.status;
      return;
    }

    var data = await response.json();
    renderTotals(data);
    renderChart(data.recentSeries);
    renderBlocks(data.activeBlocks);
    renderAnomalies(data.recentAnomalies);
  } catch {
    document.getElementById("last-updated").textContent = "Connection error";
  }
}

refresh();
setInterval(refresh, 5000);
