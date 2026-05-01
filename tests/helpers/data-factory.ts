import { faker } from '@faker-js/faker';

// Strip characters that the API HTML-encodes (e.g. ' → &#39;)
function sanitize(value: string): string {
  return value.replace(/['"&<>]/g, '');
}

export function generateSalesRequest() {
  return {
    hospitalName: sanitize(`${faker.company.name()} Hospital`),
    contactPerson: sanitize(faker.person.fullName()),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number({ style: 'international' }),
    region: sanitize(faker.location.city()),
    notes: sanitize(faker.lorem.sentence(10)),
    captchaToken: 'ok',
  };
}

export function generateMinimalSalesRequest() {
  return {
    hospitalName: sanitize(`${faker.company.name()} Clinic`),
    contactPerson: sanitize(faker.person.fullName()),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number({ style: 'international' }),
    captchaToken: 'ok',
  };
}
