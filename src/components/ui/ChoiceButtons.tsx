"use client";

import { useTranslations } from "next-intl";
import type { Answer } from "@/lib/rules/engine";
import { Button } from "./Button";

export function ChoiceButtons({ onSelect }: { onSelect: (answer: Answer) => void }) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" fullWidth onClick={() => onSelect("yes")}>
        {t("yes")}
      </Button>
      <Button size="lg" fullWidth onClick={() => onSelect("no")}>
        {t("no")}
      </Button>
      <Button size="lg" fullWidth onClick={() => onSelect("unsure")}>
        {t("notSure")}
      </Button>
    </div>
  );
}
