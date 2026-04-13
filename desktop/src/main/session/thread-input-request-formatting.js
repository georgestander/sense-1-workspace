function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

function normalizeInputChoice(choice) {
  const record = asRecord(choice);
  const label = firstString(record?.label, record?.text, record?.name, record?.value);
  if (!label) {
    return null;
  }

  return {
    label,
    description: firstString(record?.description),
    value: firstString(record?.value, record?.label, record?.text, record?.name) || label,
  };
}

function normalizeInputQuestion(question) {
  const record = asRecord(question);
  const prompt = firstString(
    record?.question,
    record?.prompt,
    record?.text,
    record?.label,
    record?.header,
  );
  if (!prompt) {
    return null;
  }

  const choices = [];
  const rawChoices = Array.isArray(record?.choices)
    ? record.choices
    : Array.isArray(record?.options)
      ? record.options
      : [];
  for (const choice of rawChoices) {
    const normalized = normalizeInputChoice(choice);
    if (normalized) {
      choices.push(normalized);
    }
  }

  return {
    id: firstString(record?.id),
    header: firstString(record?.header),
    question: prompt,
    isOther: record?.isOther === true,
    choices,
  };
}

export function normalizeInputQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => normalizeInputQuestion(question)).filter(Boolean);
}

export function buildInputPrompt(questions, fallbackPrompt = null) {
  const resolvedFallbackPrompt = firstString(fallbackPrompt);
  if (resolvedFallbackPrompt) {
    return resolvedFallbackPrompt;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return "Sense-1 needs your input.";
  }

  const lines = [];
  for (const [index, question] of questions.entries()) {
    const header = firstString(question?.header);
    const prompt = firstString(question?.question);
    if (!prompt) {
      continue;
    }

    const prefix = header ? `${header}: ` : "";
    lines.push(questions.length > 1 ? `${index + 1}. ${prefix}${prompt}` : `${prefix}${prompt}`);
    if (Array.isArray(question?.choices) && question.choices.length > 0) {
      for (const [choiceIndex, choice] of question.choices.entries()) {
        const choiceLabel = firstString(choice?.label);
        if (!choiceLabel) {
          continue;
        }

        lines.push(`   ${choiceIndex + 1}. ${choiceLabel}`);
      }
    }
    if (question?.isOther) {
      lines.push("   Other: allowed");
    }
  }

  return lines.length > 0 ? lines.join("\n") : "Sense-1 needs your input.";
}
