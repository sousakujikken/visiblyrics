# Logging Configuration

This directory contains the logging configuration for the application.

## Usage

The logging system is automatically initialized when the app starts. By default:

- **Production**: Only error logs are shown
- **Development**: All logs are disabled to reduce console noise

## Enabling Debug Logs

To enable debug logs during development, edit `src/config/logging.ts` and uncomment:

```typescript
// enableDebugLogs(['MusicPanel', 'Engine', 'Timeline']);
```

Or to enable all debug logs:

```typescript
// enableDebugLogs();
```

## Log Levels

- `error`: Critical errors that need immediate attention
- `warn`: Warnings about potential issues
- `info`: Important information about app state changes
- `debug`: Detailed debugging information (disabled by default)

## Module-specific Logging

You can enable logging for specific modules only:

```typescript
enableDebugLogs(['MusicPanel']); // Only show MusicPanel logs
```

This helps focus on specific areas during debugging.