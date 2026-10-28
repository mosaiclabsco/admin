import { expect, it } from "vitest";
import { otpEmail, supportAccessEmail } from "./email-templates";

it("preserves the support limits in both email alternatives", () => {
  const email = supportAccessEmail("012345");
  for (const content of [email.html, email.text]) {
    expect(content).toContain("012345");
    expect(content).toContain("5 minutos");
    expect(content).toContain("5 tentativas");
    expect(content).toContain("15 minutos");
  }
  expect(email.html).toContain('alt="Mosaic Labs"');
  expect(email.html).toContain(
    "https://www.mosaic-labs.co/brand/icon-text.png",
  );
});

it("keeps login expiration distinct and escapes dynamic HTML", () => {
  expect(otpEmail("123456").text).toContain("10 minutos");
  expect(otpEmail("123456").html).toContain("10 minutos");
  expect(otpEmail("123456").html).not.toContain("15 minutos");
  for (const template of [otpEmail, supportAccessEmail]) {
    const email = template('<img src=x onerror="x">');
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img");
  }
});

it("declares light-only email colors independently of system preferences", () => {
  for (const email of [otpEmail("123456"), supportAccessEmail("123456")]) {
    expect(email.html).toContain('name="color-scheme" content="light only"');
    expect(email.html).toContain('class="email-card"');
  }
});
