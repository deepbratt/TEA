import { ProjectForm } from '@/components/ProjectForm';

export const metadata = { title: 'Add project' };

export default function NewProjectPage() {
  return (
    <div className="narrow">
      <div className="page-head">
        <div>
          <h1>Add project</h1>
          <p className="help">TEA never installs packages or starts your app from here: give it a URL where the app already runs to test it live.</p>
        </div>
      </div>
      <ProjectForm />
    </div>
  );
}
