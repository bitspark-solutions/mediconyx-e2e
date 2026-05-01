import { type Locator, type Page } from '@playwright/test';

export class LandingPage {
  readonly page: Page;

  // Nav
  readonly logo: Locator;
  readonly contactSalesNavLink: Locator;
  readonly signInButton: Locator;

  // Hero
  readonly heroHeading: Locator;
  readonly onboardHospitalButton: Locator;
  readonly discoverMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.logo = page.locator('nav').getByText('Mediconyx');
    this.contactSalesNavLink = page.locator('nav').getByRole('link', { name: /Contact Sales/i });
    this.signInButton = page.locator('nav').getByRole('link', { name: /SIGN IN/i });

    this.heroHeading = page.getByRole('heading', { name: /Healthy Heart/i });
    this.onboardHospitalButton = page.getByRole('link', { name: /ONBOARD YOUR HOSPITAL/i });
    this.discoverMoreButton = page.getByRole('link', { name: /DISCOVER MORE/i });
  }

  async goto() {
    await this.page.goto('/');
  }
}
