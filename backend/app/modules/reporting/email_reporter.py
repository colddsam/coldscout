"""
Administrator reporting summary dispatch module.
Constructs and dispatches HTML-formatted email reports with encapsulated
statistical metrics and attached analytical documents.
Brand identity: black & white with shades of gray.
"""
from datetime import date
from app.config import get_settings
settings = get_settings()
from app.modules.outreach.email_sender import send_email

async def send_daily_report_email(
    report_data: dict,
    excel_filepath: str | None,
    output_date: date,
    to_email: str | None = None,
) -> bool:
    """
    Dispatches the aggregated daily statistical report to the configured recipient.

    Args:
        report_data (dict): Dictionary comprising the daily quantitative metrics.
        excel_filepath (str | None): Absolute or relative path to the generated
            Excel artifact. ``None`` when Excel generation failed — the email
            body adapts so it doesn't promise an attachment that isn't there.
        output_date (date): The contextual date associated with the report.
        to_email (str | None): Recipient address. Falls back to ``ADMIN_EMAIL``
            so the function stays backward compatible for callers that don't
            pass a per-tenant address (e.g. global admin summaries).

    Returns:
        bool: True if the dispatch was successfully processed, False otherwise.
    """
    recipient = to_email or settings.ADMIN_EMAIL
    if not recipient:
        return False

    subject = f"[Cold Scout] Daily Report — {output_date} | {report_data.get('emails_sent', 0)} sent | {report_data.get('links_clicked', 0)} clicks"
    
    html_body = f"""
    <html>
    <head>
      <style>
        body {{
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
                       Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: #000000;
        }}
      </style>
    </head>
    <body style="margin:0; padding:0; background-color:#f5f5f5; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
      <div style="max-width:560px; margin:32px auto; background:#ffffff; border:1px solid #eaeaea; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <!-- Header -->
        <div style="background:#000000; padding:28px 32px; text-align:left;">
          <p style="margin:0 0 4px; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#999999; font-weight:600;">Daily Report</p>
          <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.3px;">Cold Scout — {output_date}</h1>
        </div>

        <!-- Metrics Table -->
        <div style="padding:28px 32px;">
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr style="background:#000000;">
              <th style="text-align:left; padding:10px 14px; color:#ffffff; font-weight:700; font-size:12px; letter-spacing:0.5px;">Metric</th>
              <th style="text-align:center; padding:10px 14px; color:#ffffff; font-weight:700; font-size:12px; letter-spacing:0.5px;">Value</th>
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333333;">Leads Discovered</td>
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; text-align:center; font-weight:700; color:#000000;">{report_data.get('leads_discovered', 0)}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333333;">Leads Qualified</td>
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; text-align:center; font-weight:700; color:#000000;">{report_data.get('leads_qualified', 0)}</td>
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333333;">Emails Sent</td>
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; text-align:center; font-weight:700; color:#000000;">{report_data.get('emails_sent', 0)}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333333;">Emails Opened</td>
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; text-align:center; font-weight:700; color:#000000;">{report_data.get('emails_opened', 0)}</td>
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; color:#333333;">Links Clicked</td>
              <td style="padding:10px 14px; border-bottom:1px solid #eaeaea; text-align:center; font-weight:700; color:#000000;">{report_data.get('links_clicked', 0)}</td>
            </tr>
            <tr style="background:#ffffff;">
              <td style="padding:10px 14px; color:#333333;">Replies Received</td>
              <td style="padding:10px 14px; text-align:center; font-weight:700; color:#000000;">{report_data.get('replies_received', 0)}</td>
            </tr>
          </table>
          {"<p style='margin:20px 0 0; font-size:13px; color:#666666; line-height:1.6;'>The detailed Excel report is attached to this email.</p>" if excel_filepath else "<p style='margin:20px 0 0; font-size:13px; color:#a66; line-height:1.6;'>(Excel attachment could not be generated this run — see logs for details.)</p>"}
        </div>

        <!-- Footer -->
        <div style="background:#000000; padding:16px 32px; text-align:center;">
          <p style="margin:0; font-size:11px; color:#666666; letter-spacing:1px; text-transform:uppercase;">Cold Scout · Automated with care</p>
        </div>

      </div>
    </body>
    </html>
    """
    
    return await send_email(
        to_email=recipient,
        subject=subject,
        html_content=html_body,
        attachment_paths=[excel_filepath] if excel_filepath else []
    )
