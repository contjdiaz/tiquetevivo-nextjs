-- Migration: orders.ticket_token
--
-- El código de la plataforma (create-order, list-orders, validate-payment y el
-- tiquete público) usa `orders.ticket_token`: un identificador aleatorio (UUID)
-- que permite acceso público y seguro a un pedido sin exponer su id interno ni
-- requerir autenticación. Sin embargo, ninguna migración previa crea la columna,
-- por lo que en bases de datos existentes la inserción falla con
-- "Could not find the 'ticket_token' column of 'orders' in the schema cache".
--
-- Esta migración es aditiva e idempotente (segura de correr varias veces) y no
-- altera RLS:
--   1) Añade la columna si no existe.
--   2) Rellena los pedidos existentes que no tengan token.
--   3) Crea un índice único para las búsquedas por token (excluye NULLs).

-- 1) Columna (UUID). Nuevos pedidos reciben un valor por defecto aleatorio; el
--    backend también lo asigna explícitamente en create-order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ticket_token UUID DEFAULT gen_random_uuid();

-- 2) Backfill: asigna token a los pedidos previos que quedaron sin uno.
UPDATE orders SET ticket_token = gen_random_uuid() WHERE ticket_token IS NULL;

-- 3) Índice único para el acceso por token (partial: ignora filas sin token).
CREATE UNIQUE INDEX IF NOT EXISTS orders_ticket_token_idx
  ON orders (ticket_token)
  WHERE ticket_token IS NOT NULL;
