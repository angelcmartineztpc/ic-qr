/**
 * Cuota de QR NUEVOS por hora (QR_MAX_NEW_OBJECTS_PER_HOUR). Las claves por
 * contenido evitan escrituras repetidas, pero no distintas: sin cuota, editar
 * el Link del menú en bucle llenaría el bucket. Los QR reutilizados no cuentan.
 * En memoria: MVP de una réplica.
 */
export class HourlyQuota {
  private windowStart: number;
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {
    this.windowStart = now();
  }

  private roll(): void {
    if (this.now() - this.windowStart >= 3_600_000) {
      this.windowStart = this.now();
      this.used = 0;
    }
  }

  canCreate(): boolean {
    this.roll();
    return this.used < this.limit;
  }

  consume(): void {
    this.roll();
    this.used++;
  }

  get remaining(): number {
    this.roll();
    return Math.max(0, this.limit - this.used);
  }
}
