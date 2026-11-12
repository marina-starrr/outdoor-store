"use client";

import { useState } from "react";
import { useAuth } from "./Auth";
import Icon from "./Icon";
import { MESSAGE_MAX, contactTopics, type ContactTopic } from "./contact-topics";
import { Field, FormError, SubmitButton, formatPhone, inputCls } from "./form-ui";

type Form = { name: string; email: string; phone: string; order: string; message: string; website: string };
type Errors = Partial<Record<keyof Form, string>>;

const empty: Form = { name: "", email: "", phone: "+380 ", order: "", message: "", website: "" };

function validate(f: Form): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Вкажіть ім'я";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Перевірте email";
  const digits = f.phone.replace(/\D/g, "").length;
  if (digits > 3 && digits !== 12) e.phone = "Номер у форматі +380 XX XXX XX XX";
  if (f.message.trim().length < 10) e.message = "Опишіть питання трохи детальніше (від 10 символів)";
  return e;
}

export default function ContactForm() {
  const { user } = useAuth();
  const [topic, setTopic] = useState<ContactTopic>("advice");
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Для авторизованих підставляємо ім'я, email і телефон з профілю
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    setForm((f) => ({
      ...f,
      name: f.name || [user.firstName, user.lastName].filter(Boolean).join(" "),
      email: f.email || user.email,
      phone: f.phone.replace(/\D/g, "").length > 3 ? f.phone : user.phone || f.phone,
    }));
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const withOrder = topic === "order" || topic === "return";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`field-c-${first}`)?.focus();
      return;
    }
    setPending(true);
    setServerError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, order: withOrder ? form.order : "", topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(form.name.trim().split(" ")[0]);
      setForm((f) => ({ ...f, order: "", message: "" }));
    } catch (err) {
      setServerError(err instanceof Error && err.message ? err.message : "Не вдалося надіслати. Спробуйте ще раз.");
    }
    setPending(false);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center rounded-[20px] bg-[#e7f7ee] px-6 py-12 text-center" role="status">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-[#1f9d55] shadow-[0_10px_30px_rgba(31,157,85,.18)]">
          <Icon name="shield" className="h-8 w-8" />
        </span>
        <p className="mt-5 text-2xl font-extrabold">Дякуємо, {sent}!</p>
        <p className="mt-2 max-w-md text-[#3d5d70]">
          Звернення отримали. Відповімо на <b className="text-[#082c45]">{form.email}</b> протягом 2 годин — навіть уночі та у вихідні.
        </p>
        <button type="button" onClick={() => setSent(null)} className="mt-6 font-bold text-[#098fd0] hover:underline">
          Надіслати ще одне звернення
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-bold">Тема звернення</legend>
        <div className="flex flex-wrap gap-2">
          {contactTopics.map((t) => (
            <label key={t.id} className="cursor-pointer">
              <input type="radio" name="topic" value={t.id} checked={topic === t.id} onChange={() => setTopic(t.id)} className="peer sr-only" />
              <span className="inline-block rounded-full border border-[#d5e5ef] px-4 py-2 text-sm font-bold text-[#264e65] transition hover:border-[#0aa4e8] peer-checked:border-[#082c45] peer-checked:bg-[#082c45] peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-sky-200">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="Ім'я" error={errors.name}>
          <input id="field-c-name" autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls(errors.name)} />
        </Field>
        <Field id="c-email" label="Email для відповіді" error={errors.email}>
          <input id="field-c-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls(errors.email)} />
        </Field>
        <Field id="c-phone" label="Телефон" optional error={errors.phone} hint="Якщо зручніше, щоб ми передзвонили">
          <input id="field-c-phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} className={inputCls(errors.phone)} />
        </Field>
        {withOrder && (
          <Field id="c-order" label="Номер замовлення" optional>
            <input id="field-c-order" value={form.order} onChange={(e) => set("order", e.target.value.toUpperCase())} className={`${inputCls()} uppercase`} placeholder="FC-1234567" />
          </Field>
        )}
      </div>

      <Field
        id="c-message"
        label="Повідомлення"
        error={errors.message}
        hint={`${form.message.length} / ${MESSAGE_MAX}`}
      >
        <textarea
          id="field-c-message"
          rows={5}
          maxLength={MESSAGE_MAX}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          className={`${inputCls(errors.message)} resize-y`}
          placeholder={topic === "advice" ? "Наприклад: шукаємо намет для 2 дорослих і 2 дітей на літо, бюджет до 8 000 ₴" : "Опишіть ваше питання"}
        />
      </Field>

      {/* Пастка для ботів — приховане від людей поле */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden="true" />

      <FormError>{serverError}</FormError>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} className="sm:w-auto sm:px-10">
          Надіслати повідомлення
        </SubmitButton>
        <p className="text-xs text-[#8aa5b5]">
          Надсилаючи форму, ви погоджуєтесь з{" "}
          <a href="/privacy" className="font-bold text-[#098fd0] hover:underline">політикою конфіденційності</a>.
        </p>
      </div>
    </form>
  );
}
