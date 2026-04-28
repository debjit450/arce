function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
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
    `Updated ${new Date().toLocaleTimeString()}`;
}

function renderChart(series) {
  const container = document.getElementById("traffic-chart");
  const maxRequests = Math.max(...series.map((point) => point.requests), 1);

  container.innerHTML = series
    .map((point) => {
      const requestHeight = Math.max(
        4,
        Math.round((point.requests / maxRequests) * 170)
      );
      const blockedHeight =
        point.blocked > 0
          ? Math.max(3, Math.round((point.blocked / maxRequests) * 36))
          : 0;

      return `
        <div class="bar" title="${formatTime(point.timestamp)} | requests=${point.requests}, blocked=${point.blocked}, anomalies=${point.anomalies}">
          <div class="bar-blocked" style="height:${blockedHeight}px"></div>
          <div class="bar-fill" style="height:${requestHeight}px"></div>
          <div class="bar-label">${formatTime(point.timestamp)}</div>
        </div>
      `;
    })
    .join("");
}

function renderBlocks(blocks) {
  const container = document.getElementById("active-blocks");

  if (!blocks.length) {
    container.innerHTML =
      '<div class="empty">No active blocks right now.</div>';
    return;
  }

  container.innerHTML = blocks
    .map(
      (block) => `
        <article class="list-item">
          <strong>${block.subject}</strong>
          <p>${block.reason}</p>
          <div class="badge-row">
            <span class="badge">TTL ${(block.ttlMs / 1000).toFixed(0)}s</span>
            <span class="badge">Expires ${formatTime(block.expiresAt)}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAnomalies(events) {
  const container = document.getElementById("recent-anomalies");

  if (!events.length) {
    container.innerHTML = '<div class="empty">No flagged anomalies yet.</div>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const badges = event.anomalies
        .map((anomaly) => `<span class="badge">${anomaly.code}</span>`)
        .join("");

      return `
        <article class="list-item">
          <strong>${event.subject}</strong>
          <p>${event.reasons.join(" ")}</p>
          <div class="badge-row">
            <span class="badge">Tier ${event.tier}</span>
            <span class="badge">Risk ${event.riskScore}</span>
            <span class="badge">${formatTime(event.timestamp)}</span>
            ${badges}
          </div>
        </article>
      `;
    })
    .join("");
}

async function refresh() {
  const response = await fetch("/api/dashboard-data");
  const data = await response.json();
  renderTotals(data);
  renderChart(data.recentSeries);
  renderBlocks(data.activeBlocks);
  renderAnomalies(data.recentAnomalies);
}

refresh();
setInterval(refresh, 5000);
