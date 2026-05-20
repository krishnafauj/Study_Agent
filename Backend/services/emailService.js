import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY );

export const sendAssignmentEmail = async (toEmail, inviterName, fileName, fileId) => {
  const loginUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const fileUrl = `${loginUrl}/dashboard/${fileId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #9333ea; margin: 0;">Study_Agent</h2>
      </div>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
        <h3 style="margin-top: 0; color: #111827;">New Study Material Assigned</h3>
        
        <p style="font-size: 16px; line-height: 1.5;">
          Hello!
        </p>
        
        <p style="font-size: 16px; line-height: 1.5;">
          <strong>${inviterName}</strong> has assigned you a new study document:
        </p>
        
        <div style="background-color: #fff; border-left: 4px solid #9333ea; padding: 12px 16px; margin: 20px 0; font-weight: 500;">
          ${fileName}
        </div>
        
        <p style="font-size: 16px; line-height: 1.5;">
          You can now chat with the AI about this document's topics. (Note: For security reasons, you will only have access to chat and topics, not the raw PDF file).
        </p>
        
        <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
          <a href="${fileUrl}" style="background-color: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Document
          </a>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280;">
        <p>If you don't have an account yet, you can sign in with this email at <a href="${loginUrl}" style="color: #9333ea;">${loginUrl}</a>.</p>
      </div>
    </div>
  `;

  try {
    const data = await resend.emails.send({
      from: "Study_Agent <onboarding@resend.dev>", // Using Resend's testing domain
      to: [toEmail],
      subject: `You have been assigned a document: ${fileName}`,
      html: html,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
};
