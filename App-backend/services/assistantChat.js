function shortMetricLine(metric) {
  return `${metric.label}: etat ${metric.stateLabel}, actuel ${metric.currentValue ?? "n/a"} ${metric.unit ?? ""}, prevu ${metric.predictedValue ?? "n/a"} ${metric.unit ?? ""}, risque ${metric.riskScore ?? 0}%`;
}

function shortNodeLine(node) {
  return `${node.nodeName || "Noeud"} (${node.zoneName || "zone inconnue"}) -> ${node.stateLabel} a ${Math.round((node.confidence || 0) * 100)}% de confiance, cause ${node.rootCause || "indeterminee"}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function metricByKeyword(metrics, message) {
  const map = [
    ["temperature", ["temperature", "chaleur", "therm"]],
    ["humidity", ["humidite", "humidity"]],
    ["pressure", ["co2", "gaz co2", "dioxyde"]],
    ["gasLevel", ["fumee", "smoke", "mq2"]],
    ["vibration", ["vibration", "vibrations"]],
  ];
  const normalized = normalizeText(message);
  for (const [key, aliases] of map) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return metrics.find((metric) => metric.key === key) || null;
    }
  }
  return null;
}

export function buildAssistantReply({ message, insights }) {
  const normalized = normalizeText(message);
  const metrics = insights?.metrics || [];
  const anomalies = insights?.anomalies || [];
  const recommendations = insights?.recommendations || [];
  const classifications = insights?.classifications?.nodes || [];
  const counts = insights?.classifications?.counts || {};
  const topMetric = metrics[0] || null;
  const topNode = classifications[0] || null;
  const requestedMetric = metricByKeyword(metrics, message);

  if (requestedMetric) {
    return [
      `Pour ${requestedMetric.label}, voici la synthese actuelle:`,
      shortMetricLine(requestedMetric),
      requestedMetric.recommendation ? `Action conseillee: ${requestedMetric.recommendation}` : null,
    ].filter(Boolean).join(" ");
  }

  if (normalized.includes("anomal") || normalized.includes("alerte")) {
    if (!anomalies.length) {
      return "Aucune anomalie active n'est detectee pour le moment. Le systeme reste sous surveillance.";
    }
    const top = anomalies.slice(0, 3).map((item) => `${item.title} (${item.source})`).join("; ");
    return `Les anomalies les plus importantes sont: ${top}. ${recommendations[0]?.title || "Une verification terrain est recommandee."}`;
  }

  if (normalized.includes("risque") || normalized.includes("danger")) {
    if (!topMetric) {
      return "Je n'ai pas assez de donnees pour evaluer le risque actuellement.";
    }
    return `Le risque principal porte sur ${topMetric.label}. ${shortMetricLine(topMetric)} ${topMetric.recommendation}`;
  }

  if (normalized.includes("maintenance") || normalized.includes("entretenir")) {
    const maintenanceNodes = classifications.filter((item) => item.state === "Maintenance").slice(0, 3);
    if (!maintenanceNodes.length) {
      return "Aucun noeud n'est actuellement classe en maintenance preventive. La surveillance continue reste suffisante.";
    }
    return `Les noeuds a surveiller pour maintenance sont: ${maintenanceNodes.map(shortNodeLine).join("; ")}.`;
  }

  if (normalized.includes("class") || normalized.includes("etat") || normalized.includes("status")) {
    const summary = `Normal: ${counts.Normal || 0}, Alerte: ${counts.Alerte || 0}, Maintenance: ${counts.Maintenance || 0}, Critique: ${counts.Critique || 0}.`;
    if (!topNode) return `Repartition de classification: ${summary}`;
    return `Repartition de classification: ${summary} Noeud prioritaire: ${shortNodeLine(topNode)}.`;
  }

  if (normalized.includes("recommand") || normalized.includes("action") || normalized.includes("faire")) {
    if (!recommendations.length) {
      return "Aucune action prioritaire n'est proposee pour le moment.";
    }
    return `Voici les actions prioritaires: ${recommendations.slice(0, 3).map((item) => item.title).join("; ")}.`;
  }

  const summaryParts = [
    insights?.summary || "Le systeme reste sous surveillance.",
    topMetric ? `Metrique la plus sensible: ${shortMetricLine(topMetric)}.` : null,
    topNode ? `Noeud prioritaire: ${shortNodeLine(topNode)}.` : null,
  ].filter(Boolean);
  return summaryParts.join(" ");
}

