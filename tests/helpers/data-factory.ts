import { faker } from '@faker-js/faker';

export function generateSalesRequest() {
  return {
    hospitalName: `${faker.company.name()} Hospital`,
    contactPerson: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number({ style: 'international' }),
    region: faker.location.city(),
    notes: faker.lorem.sentence(10),
    captchaToken: 'ok',
  };
}

export function generateMinimalSalesRequest() {
  return {
    hospitalName: `${faker.company.name()} Clinic`,
    contactPerson: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    phone: faker.phone.number({ style: 'international' }),
    captchaToken: 'ok',
  };
}
