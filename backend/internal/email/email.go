package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type Service struct {
	apiKey    string
	fromEmail string
	appURL    string
	client    *http.Client
}

func NewService(apiKey, fromEmail, appURL string) *Service {
	if fromEmail == "" {
		fromEmail = "ZeroVC <noreply@safiroko.xyz>"
	}
	if appURL == "" {
		appURL = "https://zerovc.safiroko.xyz"
	}
	appURL = strings.TrimRight(appURL, "/")

	return &Service{
		apiKey:    apiKey,
		fromEmail: fromEmail,
		appURL:    appURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

type resendSendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

type resendSendResponse struct {
	ID    string `json:"id,omitempty"`
	Error string `json:"message,omitempty"`
}

func (s *Service) sendEmail(ctx context.Context, toEmail, subject, htmlContent string) error {
	if s.apiKey == "" {
		log.Printf("[Email] Warning: RESEND_API_KEY is not configured. Email to %s was not sent:\nSubject: %s", toEmail, subject)
		return nil
	}

	reqBody, err := json.Marshal(resendSendRequest{
		From:    s.fromEmail,
		To:      []string{toEmail},
		Subject: subject,
		HTML:    htmlContent,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal email payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.resend.com/emails", bytes.NewBuffer(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create email request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send email via Resend: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var resendResp resendSendResponse
	_ = json.Unmarshal(bodyBytes, &resendResp)
	log.Printf("[Email] Sent successfully to %s (ID: %s)", toEmail, resendResp.ID)
	return nil
}

// SendVerificationEmail envia o código de 6 dígitos para confirmação de conta
func (s *Service) SendVerificationEmail(ctx context.Context, toEmail, username, code string) error {
	subject := fmt.Sprintf("%s é o seu código de verificação do ZeroVC", code)

	html := fmt.Sprintf(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifique seu E-mail</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0d12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e1e3e8;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0c0d12; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #15161e; border: 1px solid #282937; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 35px 35px 20px 35px; text-align: center; border-bottom: 1px solid #232431;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                <span style="color: #6366f1;">Zero</span>VC
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #8a8d9b;">Comunicação por voz e texto</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 30px 35px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #ffffff; font-weight: 700;">Olá, @%s! 👋</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a4a7b5;">
                Obrigado por se registrar no ZeroVC. Para concluir o cadastro da sua conta e liberar o acesso, use o código de verificação abaixo:
              </p>
              
              <!-- Code Box -->
              <div style="background-color: #0c0d12; border: 2px dashed #6366f1; border-radius: 14px; padding: 18px 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'Courier New', monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #818cf8;">
                  %s
                </span>
              </div>

              <p style="margin: 0; font-size: 12px; color: #6b6f82; line-height: 1.5; text-align: center;">
                Este código expira em <strong>15 minutos</strong>.<br>Se você não solicitou este cadastro, pode ignorar este e-mail com segurança.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 35px; background-color: #0f1016; text-align: center; border-top: 1px solid #1f202c;">
              <p style="margin: 0; font-size: 11px; color: #585c6d;">
                &copy; 2026 ZeroVC. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`, username, code)

	return s.sendEmail(ctx, toEmail, subject, html)
}

// SendPasswordResetEmail envia o link seguro para redefinição de senha
func (s *Service) SendPasswordResetEmail(ctx context.Context, toEmail, username, token string) error {
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.appURL, token)
	subject := "Redefinição de Senha - ZeroVC"

	html := fmt.Sprintf(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinir Senha</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0d12; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e1e3e8;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0c0d12; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #15161e; border: 1px solid #282937; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 35px 35px 20px 35px; text-align: center; border-bottom: 1px solid #232431;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                <span style="color: #6366f1;">Zero</span>VC
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #8a8d9b;">Redefinição de Acesso</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 30px 35px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #ffffff; font-weight: 700;">Olá, @%s!</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #a4a7b5;">
                Recebemos uma solicitação para redefinir a senha da sua conta no ZeroVC. Clique no botão abaixo para escolher uma nova senha:
              </p>
              
              <!-- Action Button -->
              <div style="text-align: center; margin-bottom: 28px;">
                <a href="%s" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                  Redefinir Minha Senha
                </a>
              </div>

              <p style="margin: 0 0 16px 0; font-size: 12px; color: #7f8396; line-height: 1.5; word-break: break-all;">
                Se o botão acima não funcionar, copie e cole o seguinte link no seu navegador:<br>
                <a href="%s" style="color: #818cf8;">%s</a>
              </p>

              <div style="padding: 12px 16px; background-color: #1a1528; border-left: 3px solid #a855f7; border-radius: 6px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 12px; color: #d8b4fe; line-height: 1.4;">
                  🛡️ <strong>Atenção:</strong> Se sua conta possui <strong>Autenticação de 2 Fatores (2FA)</strong> ativada, você também precisará informar o código do seu aplicativo autenticador para confirmar a nova senha.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; color: #6b6f82; line-height: 1.5; text-align: center;">
                Este link expira em <strong>15 minutos</strong>.<br>Se você não solicitou esta redefinição, proteja sua conta e ignore este e-mail.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 35px; background-color: #0f1016; text-align: center; border-top: 1px solid #1f202c;">
              <p style="margin: 0; font-size: 11px; color: #585c6d;">
                &copy; 2026 ZeroVC. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`, username, resetLink, resetLink, resetLink)

	return s.sendEmail(ctx, toEmail, subject, html)
}
