export type TerminalShell = 'sh' | 'bash'
type TerminalTicket = {ticket: string; shell: TerminalShell}
const terminalTickets = new Map<string, TerminalTicket>()

export function rememberTerminalTicket(taskId: string, ticket: string, shell: TerminalShell): void {
    terminalTickets.set(taskId, {ticket, shell})
}

export function consumeTerminalTicket(taskId: string): TerminalTicket | undefined {
    const ticket = terminalTickets.get(taskId)
    terminalTickets.delete(taskId)
    return ticket
}
