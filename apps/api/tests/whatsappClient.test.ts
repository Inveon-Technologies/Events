import {
  normalizeWhatsAppNumber,
  sendWhatsAppTemplate,
  templateName,
  whatsAppProvider,
  WhatsAppApiError,
  WhatsAppInvalidNumberError,
  WhatsAppNotConfiguredError,
} from '../src/services/whatsapp/client';

const ENV_KEYS = [
  'WHATSAPP_PROVIDER',
  'AISENSY_API_KEY',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION',
  'WHATSAPP_TEMPLATE_LANGUAGE',
];

describe('WhatsApp client', () => {
  let fetchMock: jest.SpyInstance;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: 'true' }), { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('normalizes the ways people type Indian numbers', () => {
    expect(normalizeWhatsAppNumber('98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('+91-98765-43210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('098765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('0091 98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('+44 7700 900123')).toBe('447700900123');
    expect(() => normalizeWhatsAppNumber('12345')).toThrow(WhatsAppInvalidNumberError);
  });

  it('is off until a provider and its credentials are set', async () => {
    expect(whatsAppProvider()).toBeNull();
    process.env.WHATSAPP_PROVIDER = 'aisensy';
    expect(whatsAppProvider()).toBeNull(); // no API key yet
    await expect(
      sendWhatsAppTemplate({ message: 'bookingConfirmation', to: '9876543210', recipientName: 'A', params: [] }),
    ).rejects.toThrow(WhatsAppNotConfiguredError);
    process.env.AISENSY_API_KEY = 'key';
    expect(whatsAppProvider()).toBe('aisensy');
  });

  it('sends through an AiSensy API campaign, with clean parameters', async () => {
    process.env.WHATSAPP_PROVIDER = 'aisensy';
    process.env.AISENSY_API_KEY = 'secret-key';

    await sendWhatsAppTemplate({
      message: 'bookingConfirmation',
      to: '+91 98765 43210',
      recipientName: 'Asha',
      params: ['Asha', 'Sunrise\nTrek', '', 'INV-1'],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://backend.aisensy.com/campaign/t1/api/v2');
    expect(JSON.parse(init.body)).toEqual({
      apiKey: 'secret-key',
      campaignName: 'booking_confirmation',
      destination: '919876543210',
      userName: 'Asha',
      templateParams: ['Asha', 'Sunrise Trek', '-', 'INV-1'],
      source: 'inveon-events',
    });
  });

  it('sends through the Meta Cloud API with the same call', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION = 'booking_confirmation_v2';

    await sendWhatsAppTemplate({ message: 'bookingConfirmation', to: '9876543210', recipientName: 'Asha', params: ['Asha', 'Trek'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect(init.headers.Authorization).toBe('Bearer meta-token');
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'booking_confirmation_v2',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Asha' },
              { type: 'text', text: 'Trek' },
            ],
          },
        ],
      },
    });
    expect(templateName('eventReminder')).toBe('event_reminder');
  });

  it('throws on a provider error so the queue retries', async () => {
    process.env.WHATSAPP_PROVIDER = 'aisensy';
    process.env.AISENSY_API_KEY = 'k';
    fetchMock.mockResolvedValueOnce(new Response('{"message":"Campaign not found"}', { status: 400 }));
    await expect(sendWhatsAppTemplate({ message: 'eventReminder', to: '9876543210', recipientName: 'A', params: ['A'] })).rejects.toThrow(
      WhatsAppApiError,
    );
  });
});
