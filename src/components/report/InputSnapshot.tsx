import type { CurrencyCode } from '@/domain/currency';
import { EVA_INPUT_DEFINITIONS, EVA_INPUT_FIELDS } from '@/domain/evaTypes';
import type { EvaInputs } from '@/domain/evaTypes';
import { formatCurrency } from '@/domain/formatting';
import styles from './InputSnapshot.module.css';

interface InputSnapshotProps {
  inputs: EvaInputs;
  currency: CurrencyCode;
}

/** The four user-entered values, formatted in the selected currency. */
export function InputSnapshot({ inputs, currency }: InputSnapshotProps) {
  return (
    <dl className={styles.list}>
      {EVA_INPUT_FIELDS.map((field) => {
        const { symbol, name, definition } = EVA_INPUT_DEFINITIONS[field];

        return (
          <div key={field} className={styles.item}>
            <dt className={styles.term}>
              <span className={styles.symbol}>{symbol}</span>
              <span className={styles.name}>{name}</span>
            </dt>
            <dd className={`${styles.value} numeric`}>{formatCurrency(inputs[field], currency)}</dd>
            <dd className={styles.definition}>{definition}</dd>
          </div>
        );
      })}
    </dl>
  );
}
