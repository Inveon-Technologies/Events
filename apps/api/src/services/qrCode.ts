import QRCode from 'qrcode';

// Encodes the ticket's qrToken, never its database id — qrToken is a
// separate, unguessable value specifically for this purpose (see the
// Ticket model), so a leaked/printed QR image can't be used to look up
// or manipulate the ticket record directly via its real id.
export async function generateTicketQrPng(qrToken: string): Promise<Buffer> {
  return QRCode.toBuffer(qrToken, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
