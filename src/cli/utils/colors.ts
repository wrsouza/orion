const isColorSupported = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;

const code = (n: number) => (isColorSupported ? `\x1b[${n}m` : '');

export const colors = {
  reset: code(0),
  bold: code(1),
  dim: code(2),
  green: code(32),
  yellow: code(33),
  red: code(31),
  cyan: code(36),
  gray: code(90),
  white: code(37),
};

export function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

export function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

export function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

export function cyan(text: string): string {
  return `${colors.cyan}${text}${colors.reset}`;
}

export function gray(text: string): string {
  return `${colors.gray}${text}${colors.reset}`;
}

export function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

export function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}
