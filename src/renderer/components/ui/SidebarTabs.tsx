import React from 'react';
import { Tab } from '@headlessui/react';

const SidebarTabs: React.FC<{
  labels: string[];
  children: React.ReactNode[];
}> = ({ labels, children }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Tab.Group as="div" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Tab.List className="tab-list">
        {labels.map(label => (
          <Tab key={label} className="tab-button">
            {({ selected }) => (
              <span
                className={`tab-button-text ${selected ? 'selected' : ''}`}
                aria-selected={selected}
              >
                {label}
              </span>
            )}
          </Tab>
        ))}
      </Tab.List>
      <Tab.Panels className="tab-panels">
        {children.map((panel, i) => (
          <Tab.Panel key={i} className="panel-content">{panel}</Tab.Panel>
        ))}
      </Tab.Panels>
    </Tab.Group>
  </div>
);

export default SidebarTabs;