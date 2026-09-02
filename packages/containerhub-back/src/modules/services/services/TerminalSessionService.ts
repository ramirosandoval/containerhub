import {createHash, randomBytes} from 'node:crypto'

export type TerminalShell = 'sh' | 'bash'

type TerminalSessionInput = {
    userId: string
    taskId: string
    shell: TerminalShell
}

type StoredTerminalSession = TerminalSessionInput & {
    expiresAt: number
}

const TERMINAL_TICKET_LIFETIME_MS = 60_000

export class TerminalSessionRegistry {
    // ponytail: in-memory tickets work for one backend process; use a shared atomic store before multi-instance deployment.
    private readonly sessions = new Map<string, StoredTerminalSession>()

    constructor(private readonly currentTime: () => number = Date.now) {}

    create(input: TerminalSessionInput): string {
        if (input.shell !== 'sh' && input.shell !== 'bash') throw new Error('shell must be sh or bash')
        this.removeExpired()
        const ticket = randomBytes(32).toString('hex')
        this.sessions.set(this.hashTicket(ticket), {...input, expiresAt: this.currentTime() + TERMINAL_TICKET_LIFETIME_MS})
        return ticket
    }

    consume(ticket: string): TerminalSessionInput | undefined {
        const ticketHash = this.hashTicket(ticket)
        const session = this.sessions.get(ticketHash)
        if (!session) return undefined
        if (session.expiresAt <= this.currentTime()) {
            this.sessions.delete(ticketHash)
            return undefined
        }
        this.sessions.delete(ticketHash)
        return {userId: session.userId, taskId: session.taskId, shell: session.shell}
    }

    private removeExpired(): void {
        for (const [ticketHash, session] of this.sessions) if (session.expiresAt <= this.currentTime()) this.sessions.delete(ticketHash)
    }

    private hashTicket(ticket: string): string {
        return createHash('sha256').update(ticket).digest('hex')
    }
}

export const terminalSessions = new TerminalSessionRegistry()
