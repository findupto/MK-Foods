# Kitchen Display System

## Lifecycle

New → Preparing → Ready → Completed, with Cancelled/Voided and Recalled states where permitted.

## Routing

Route order lines by category, item, modifier, production station, printer, or configured fallback. One order may produce tickets for multiple stations while retaining a shared order ID.

## Timing

Capture received, started, ready and completed timestamps. Calculate target prep time, actual prep time, variance, SLA percentage and queue wait.

## Visual states

Configurable colors for New, Preparing, Ready, Late, Completed and Exception. Color is supplemental; status text/icons must remain accessible.

## Alerts & analytics

Late-order alerts, station backlog, average prep time, p50/p90 prep time, throughput, cancelled/reworked tickets, hourly load and station performance.

## Printer fallback

Kitchen printer routing is independent of KDS display routing. Print failures enter a durable queue and are visible to authorized staff.
