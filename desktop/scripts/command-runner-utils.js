export function resolveScriptCommand(commandName, platform = process.platform) {
  if (platform === "win32" && commandName === "pnpm") {
    return "pnpm.cmd";
  }

  return commandName;
}

export function formatCommand(commandName, commandArgs = []) {
  return [commandName, ...commandArgs].join(" ");
}

export function formatSpawnFailure(commandName, commandArgs, result) {
  const details = [];
  if (result.status != null) {
    details.push(`exit ${result.status}`);
  }
  if (result.signal) {
    details.push(`signal ${result.signal}`);
  }
  if (result.error) {
    details.push(result.error.message);
  }

  return `Command failed (${formatCommand(commandName, commandArgs)}): ${details.join(", ") || "exit unknown"}`;
}
