function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildVerificationEmail(user, link) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return {
    subject: "DataCentre App Confirmation de votre adresse email",
    text:
      `Bonjour ${fullName},

` +
      `Merci pour votre inscription sur DataCentre App. Veuillez confirmer votre adresse email via le lien suivant :
${link}

` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Confirmation d'adresse email</h2>
        <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Merci pour votre inscription sur DataCentre App. Veuillez confirmer votre adresse email pour activer votre compte.</p>
        <p style="margin:18px 0">
          <a href="${escapeHtml(link)}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Confirmer mon email</a>
        </p>
        <p style="font-size:12px;color:#6b7280">Lien direct : ${escapeHtml(link)}</p>
      </div>
    `,
  };
}

export function buildSignupConfirmationEmail({ user, timestamp, ip, userAgent }) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return {
    subject: "DataCentre App Confirmation de création de compte",
    text:
      `Bonjour ${fullName},

` +
      `Votre compte DataCentre App a bien été créé le ${timestamp}.
` +
      `Email: ${user.email}
Téléphone: ${user.phone || "Non renseigné"}
IP: ${ip || "Indisponible"}
Appareil: ${userAgent || "Indisponible"}

` +
      `Si vous n'êtes pas à l'origine de cette inscription, contactez immédiatement l'administrateur.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Compte créé avec succès</h2>
        <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Votre compte DataCentre App a bien été créé.</p>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Date / heure</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(timestamp)}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Email</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(user.email)}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Téléphone</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(user.phone || "Non renseigné")}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">IP</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(ip || "Indisponible")}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Appareil</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(userAgent || "Indisponible")}</td></tr>
        </table>
      </div>
    `,
  };
}

export function buildLoginSecurityEmail({ user, timestamp, ip, userAgent }) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return {
    subject: "DataCentre App Alerte de sécurité: nouvelle connexion",
    text:
      `Bonjour ${fullName},

` +
      `Une connexion à votre compte DataCentre App a été détectée le ${timestamp}.
` +
      `IP: ${ip || "Indisponible"}
Appareil: ${userAgent || "Indisponible"}

` +
      `Si ce n'était pas vous, changez immédiatement votre mot de passe et contactez l'administrateur.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Nouvelle connexion détectée</h2>
        <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Une connexion à votre compte DataCentre App a été détectée.</p>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Date / heure</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(timestamp)}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">IP</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(ip || "Indisponible")}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Appareil</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(userAgent || "Indisponible")}</td></tr>
        </table>
        <p style="margin-top:16px;color:#b91c1c"><strong>Si cette connexion n'est pas légitime, changez immédiatement votre mot de passe.</strong></p>
      </div>
    `,
  };
}


export function buildPasswordResetEmail(user, link, rawToken) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return {
    subject: "DataCentre App Réinitialisation du mot de passe",
    text:
      `Bonjour ${fullName},

` +
      `Une demande de réinitialisation du mot de passe a été reçue pour votre compte DataCentre App.
` +
      `Ouvrez ce lien pour définir un nouveau mot de passe :
${link}

` +
      `Code de réinitialisation (utile dans l'app mobile) :
${rawToken}

` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Réinitialisation du mot de passe</h2>
        <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Une demande de réinitialisation du mot de passe a été reçue pour votre compte DataCentre App.</p>
        <p style="margin:18px 0">
          <a href="${escapeHtml(link)}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Réinitialiser mon mot de passe</a>
        </p>
        <p style="font-size:12px;color:#6b7280;margin:0 0 8px">Lien direct : ${escapeHtml(link)}</p>
        <p style="font-size:12px;color:#6b7280;margin:0">Code de réinitialisation pour l'app mobile : <strong>${escapeHtml(rawToken)}</strong></p>
      </div>
    `,
  };
}

export function buildPasswordResetSuccessEmail({ user, timestamp, ip, userAgent }) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return {
    subject: "DataCentre App Mot de passe modifié",
    text:
      `Bonjour ${fullName},

` +
      `Le mot de passe de votre compte DataCentre App a été modifié le ${timestamp}.
` +
      `IP: ${ip || "Indisponible"}
Appareil: ${userAgent || "Indisponible"}

` +
      `Si vous n'êtes pas à l'origine de cette action, contactez immédiatement l'administrateur.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Mot de passe modifié</h2>
        <p>Bonjour <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Le mot de passe de votre compte DataCentre App a été modifié.</p>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Date / heure</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(timestamp)}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">IP</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(ip || "Indisponible")}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Appareil</td><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(userAgent || "Indisponible")}</td></tr>
        </table>
        <p style="margin-top:16px;color:#b91c1c"><strong>Si ce n'était pas vous, contactez immédiatement l'administrateur.</strong></p>
      </div>
    `,
  };
}

export function buildAlertEmail({ recipientsLabel = "Utilisateur", datacenter, zone, node, alert, timestamp }) {
  const level = String(alert.level || "warning").toUpperCase();
  const levelColor = alert.level === "alert" ? "#dc2626" : "#d97706";
  const levelBg = alert.level === "alert" ? "#fef2f2" : "#fffbeb";
  const levelBorder = alert.level === "alert" ? "#fecaca" : "#fde68a";

  const metricLabel = (key) => ({
    temperature: "Temperature", humidity: "Humidite", pressure: "Gaz CO2",
    vibration: "Vibration", gasLevel: "Fumee",
  }[key] || key);

  const metricUnit = (key) => ({
    temperature: "°C", humidity: "%", pressure: "ppm", vibration: "mm/s", gasLevel: "ppm",
  }[key] || "");

  const triggered = alert.triggeredMetrics || [];
  const metricRowsHtml = triggered.map((metric) => `
    <tr>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;font-weight:500">${escapeHtml(metricLabel(metric.metricName))}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;font-weight:700;color:${metric.state === "alert" ? "#dc2626" : "#d97706"}">${escapeHtml(Number(metric.value).toFixed(2))} ${escapeHtml(metricUnit(metric.metricName))}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;color:#6b7280">${metric.warningMin ?? "—"} – ${metric.warningMax ?? "—"} ${escapeHtml(metricUnit(metric.metricName))}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb;color:#6b7280">${metric.alertMin ?? "—"} – ${metric.alertMax ?? "—"} ${escapeHtml(metricUnit(metric.metricName))}</td>
      <td style="padding:8px 10px;border:1px solid #e5e7eb">
        <span style="background:${metric.state === "alert" ? "#fef2f2" : "#fffbeb"};color:${metric.state === "alert" ? "#dc2626" : "#d97706"};padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;text-transform:uppercase">${escapeHtml(metric.state)}</span>
      </td>
    </tr>
  `).join("");

  const textMetrics = triggered.map((m) => `  • ${metricLabel(m.metricName)}: ${Number(m.value).toFixed(2)} ${metricUnit(m.metricName)} [${m.state.toUpperCase()}]`).join("\n");

  return {
    subject: `DataCentre App ${level}: ${datacenter?.name || "Datacenter"}`,
    text: `DATAcentre APP — ALERTE ${level}]\n\nUne anomalie a été détectée sur la plateforme DataCentre App.\n\nLocalisation :\n  • Datacenter : ${datacenter?.name || "N/A"}\n  • Zone       : ${zone?.name || "N/A"}\n  • Node       : ${node?.name || "N/A"}\n  • Date/Heure : ${timestamp}\n  • Niveau     : ${level} (${triggered.length} métrique(s) hors seuil)\n\nMétriques déclenchées :\n${textMetrics || "  Aucune métrique disponible"}\n\nNiveau WARNING = 1 métrique hors seuil | ALERT = 2+ métriques hors seuil.\n`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;margin:auto">
        <div style="background:#111827;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px">DATAcentre APP</span>
          <span style="background:${levelColor};color:#fff;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-left:10px;letter-spacing:1px">${escapeHtml(level)}</span>
          <p style="color:#9ca3af;font-size:13px;margin:6px 0 0">Système de Surveillance IoT — Datacenter</p>
        </div>
        <div style="background:${levelBg};border:1px solid ${levelBorder};border-top:none;padding:14px 24px">
          <p style="margin:0;font-size:15px;font-weight:600;color:${levelColor}">⚠ Anomalie détectée — ${escapeHtml(String(triggered.length))} métrique(s) hors seuil</p>
          <p style="margin:4px 0 0;font-size:13px;color:#374151">${triggered.length === 1 ? "Niveau <strong>WARNING</strong> : 1 métrique hors seuil" : `Niveau <strong>ALERT</strong> : ${triggered.length} métriques hors seuil`}</p>
        </div>
        <div style="padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
          <h3 style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px">Localisation</h3>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr><td style="padding:7px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:35%">Datacenter</td><td style="padding:7px 10px;border:1px solid #e5e7eb">${escapeHtml(datacenter?.name || "N/A")}</td></tr>
            <tr><td style="padding:7px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Zone</td><td style="padding:7px 10px;border:1px solid #e5e7eb">${escapeHtml(zone?.name || "N/A")}</td></tr>
            <tr><td style="padding:7px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Node</td><td style="padding:7px 10px;border:1px solid #e5e7eb">${escapeHtml(node?.name || "N/A")}</td></tr>
            <tr><td style="padding:7px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Date / Heure</td><td style="padding:7px 10px;border:1px solid #e5e7eb">${escapeHtml(timestamp)}</td></tr>
            <tr><td style="padding:7px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600">Niveau</td><td style="padding:7px 10px;border:1px solid #e5e7eb"><span style="background:${levelBg};color:${levelColor};padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid ${levelBorder}">${escapeHtml(level)}</span></td></tr>
          </table>
        </div>
        <div style="padding:20px 24px;border:1px solid #e5e7eb;border-top:none">
          <h3 style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px">Métriques déclenchées</h3>
          ${triggered.length === 0 ? '<p style="color:#9ca3af;font-size:14px">Aucune métrique disponible.</p>' : `
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead><tr style="background:#f9fafb">
              <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb">Métrique</th>
              <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb">Valeur</th>
              <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb">Seuil warning</th>
              <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb">Seuil alert</th>
              <th style="text-align:left;padding:8px 10px;border:1px solid #e5e7eb">État</th>
            </tr></thead>
            <tbody>${metricRowsHtml}</tbody>
          </table>`}
        </div>
        <div style="background:#f9fafb;padding:14px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0;font-size:12px;color:#9ca3af">Message automatique DataCentre App IoT. Ne pas répondre. — <strong>WARNING</strong> = 1 métrique hors seuil · <strong>ALERT</strong> = 2+ métriques hors seuil.</p>
        </div>
      </div>
    `,
  };
}
