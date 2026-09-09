-- Renomeia o Contrato "ARM RIO" para "POLI RIO" (pedido do cliente).
-- Só atualiza o nome da linha existente — nenhuma outra tabela referencia o
-- nome (tudo usa sector_id), então funcionários, provas, tentativas etc.
-- continuam intactos, só o rótulo exibido muda.
UPDATE "sectors" SET "name" = 'POLI RIO' WHERE "name" = 'ARM RIO';
